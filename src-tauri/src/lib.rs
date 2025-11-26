use aws_config::BehaviorVersion;
use aws_credential_types::provider::ProvideCredentials;
use aws_sdk_cloudwatchlogs::{types::FilteredLogEvent, Client as CloudWatchClient};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, State,
};
use tokio::sync::Mutex;

/// Represents a log event returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEvent {
    pub timestamp: i64,
    pub message: String,
    pub log_stream_name: Option<String>,
    pub event_id: Option<String>,
}

impl From<FilteredLogEvent> for LogEvent {
    fn from(event: FilteredLogEvent) -> Self {
        Self {
            timestamp: event.timestamp.unwrap_or(0),
            message: event.message.unwrap_or_default(),
            log_stream_name: event.log_stream_name,
            event_id: event.event_id,
        }
    }
}

/// Represents a log group
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogGroup {
    pub name: String,
    pub arn: Option<String>,
    pub stored_bytes: Option<i64>,
}

/// Application state holding the CloudWatch client and config
pub struct AppState {
    pub client: Arc<Mutex<Option<CloudWatchClient>>>,
    pub config: Arc<Mutex<Option<aws_config::SdkConfig>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            config: Arc::new(Mutex::new(None)),
        }
    }
}

/// Check if an error indicates the SSO session has expired (requires browser re-auth)
fn is_sso_session_expired(error_msg: &str) -> bool {
    let error_lower = error_msg.to_lowercase();
    error_lower.contains("token has expired")
        || error_lower.contains("sso session")
        || error_lower.contains("refresh token")
        || error_lower.contains("re-authenticate")
        || error_lower.contains("accessdeniedexception")
        || error_lower.contains("invalid_grant")
}

/// Convert AWS SDK errors to human-friendly messages
fn humanize_aws_error(error_msg: &str) -> String {
    let error_lower = error_msg.to_lowercase();

    // Check credential errors FIRST - these are often wrapped in dispatch failures
    // SSO/token expiration errors
    if error_lower.contains("token has expired")
        || error_lower.contains("sso session")
        || error_lower.contains("invalid_grant")
        || error_lower.contains("the sso session")
        || error_lower.contains("expired sso token")
        || error_lower.contains("sso token")
    {
        return "Your AWS session has expired. Please run 'aws sso login' to refresh your credentials.".to_string();
    }

    // Missing credentials (often wrapped in DispatchFailure)
    if error_lower.contains("no credentials")
        || error_lower.contains("missing credentials")
        || error_lower.contains("failed to load credentials")
        || (error_lower.contains("credential")
            && (error_lower.contains("provider") || error_lower.contains("not found")))
        || (error_lower.contains("could not find")
            && (error_lower.contains("profile") || error_lower.contains("credential")))
    {
        return "No AWS credentials found. Please run 'aws sso login' or configure your AWS credentials.".to_string();
    }

    // Access denied / authorization errors
    if error_lower.contains("accessdenied")
        || error_lower.contains("access denied")
        || error_lower.contains("not authorized")
        || error_lower.contains("unauthorized")
    {
        return "Access denied. Your AWS credentials don't have permission for this operation."
            .to_string();
    }

    // Invalid credentials
    if error_lower.contains("invalid") && error_lower.contains("credential") {
        return "Invalid AWS credentials. Please check your AWS configuration.".to_string();
    }

    // Dispatch failure - check what's inside it
    // This is a catch-all wrapper, so we need to be careful
    if error_lower.contains("dispatch failure") || error_lower.contains("dispatchfailure") {
        // If it mentions credentials or SSO anywhere, it's likely a credential issue
        if error_lower.contains("credential")
            || error_lower.contains("sso")
            || error_lower.contains("token")
            || error_lower.contains("profile")
        {
            return "AWS credentials error. Please run 'aws sso login' or check your AWS configuration.".to_string();
        }
        // Otherwise, it's likely a network issue
        return "Unable to connect to AWS. This could be a network issue or expired credentials. Try running 'aws sso login'.".to_string();
    }

    // Network-specific errors (only if not credential-related)
    if error_lower.contains("connector error") || error_lower.contains("hyper::error") {
        return "Unable to connect to AWS. Please check your network connection.".to_string();
    }

    if error_lower.contains("timeout") || error_lower.contains("timed out") {
        return "Connection to AWS timed out. Please try again.".to_string();
    }

    if error_lower.contains("dns") || error_lower.contains("name resolution") {
        return "Unable to resolve AWS endpoint. Please check your network connection.".to_string();
    }

    // Resource errors
    if error_lower.contains("resourcenotfound") || error_lower.contains("does not exist") {
        return "The requested log group was not found.".to_string();
    }

    if error_lower.contains("throttling") || error_lower.contains("rate exceeded") {
        return "AWS rate limit exceeded. Please wait a moment and try again.".to_string();
    }

    // Region errors
    if error_lower.contains("region") && error_lower.contains("not") {
        return "Invalid or missing AWS region. Please check your AWS configuration.".to_string();
    }

    // Service errors
    if error_lower.contains("service") && error_lower.contains("unavailable") {
        return "AWS CloudWatch Logs service is temporarily unavailable. Please try again later."
            .to_string();
    }

    // Default: return a cleaned up version of the original error
    // Strip common prefixes and technical details
    let cleaned = error_msg
        .replace("DispatchFailure(", "")
        .replace("ConnectorError", "Connection error")
        .replace("SdkError", "")
        .trim_matches(|c| c == '(' || c == ')' || c == ':' || c == ' ')
        .to_string();

    if cleaned.is_empty() || cleaned.len() < 5 {
        return "An unexpected error occurred while connecting to AWS.".to_string();
    }

    cleaned
}

/// Error response that includes whether reconnection is needed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwsError {
    pub message: String,
    pub requires_reconnect: bool,
}

/// AWS connection info returned on successful init
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwsConnectionInfo {
    pub profile: Option<String>,
    pub region: Option<String>,
}

/// Initialize the AWS CloudWatch client using the default credential chain
/// The SDK will auto-refresh SSO credentials as long as the SSO session is valid
#[tauri::command]
async fn init_aws_client(state: State<'_, AppState>) -> Result<AwsConnectionInfo, String> {
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;

    // Get profile from environment
    let profile = std::env::var("AWS_PROFILE").ok();
    let region = config.region().map(|r| r.to_string());

    // Step 1: Verify credentials can be loaded (this catches SSO expiration, missing creds, etc.)
    if let Some(credentials_provider) = config.credentials_provider() {
        match credentials_provider.provide_credentials().await {
            Ok(_) => {
                // Credentials loaded successfully
            }
            Err(e) => {
                let error_msg = format!("{}", e);
                // Provide specific credential error messages
                if error_msg.to_lowercase().contains("token")
                    || error_msg.to_lowercase().contains("sso")
                    || error_msg.to_lowercase().contains("expired")
                {
                    return Err(
                        "Your AWS session has expired. Please run 'aws sso login' to refresh."
                            .to_string(),
                    );
                }
                return Err(format!(
                    "AWS credentials error: {}. Please run 'aws sso login' or check your AWS configuration.",
                    error_msg
                ));
            }
        }
    } else {
        return Err(
            "No AWS credentials configured. Please run 'aws sso login' or configure credentials."
                .to_string(),
        );
    }

    // Step 2: Create client and test connection (this catches network issues)
    let client = CloudWatchClient::new(&config);

    match client.describe_log_groups().limit(1).send().await {
        Ok(_) => {
            // Store both client and config (config holds the credential provider for auto-refresh)
            let mut config_lock = state.config.lock().await;
            *config_lock = Some(config);
            drop(config_lock);

            let mut client_lock = state.client.lock().await;
            *client_lock = Some(client);
            Ok(AwsConnectionInfo { profile, region })
        }
        Err(e) => {
            let error_msg = format!("{}", e);
            // At this point, credentials are valid, so it's likely a network or permission issue
            if error_msg.to_lowercase().contains("accessdenied")
                || error_msg.to_lowercase().contains("not authorized")
            {
                return Err("Access denied. Your credentials don't have permission to access CloudWatch Logs.".to_string());
            }
            Err(format!(
                "Unable to connect to AWS. Please check your network connection. ({})",
                humanize_aws_error(&error_msg)
            ))
        }
    }
}

/// Reconnect to AWS with fresh credentials
/// Call this after running `aws sso login` or `aws-switch` when the SSO session has expired
#[tauri::command]
async fn reconnect_aws(state: State<'_, AppState>) -> Result<AwsConnectionInfo, String> {
    // Clear existing client and config
    {
        let mut client_lock = state.client.lock().await;
        *client_lock = None;
    }
    {
        let mut config_lock = state.config.lock().await;
        *config_lock = None;
    }

    // Re-initialize with fresh credentials from the provider chain
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;

    let profile = std::env::var("AWS_PROFILE").ok();
    let region = config.region().map(|r| r.to_string());

    // Step 1: Verify credentials can be loaded
    if let Some(credentials_provider) = config.credentials_provider() {
        match credentials_provider.provide_credentials().await {
            Ok(_) => {
                // Credentials loaded successfully
            }
            Err(e) => {
                let error_msg = format!("{}", e);
                if error_msg.to_lowercase().contains("token")
                    || error_msg.to_lowercase().contains("sso")
                    || error_msg.to_lowercase().contains("expired")
                {
                    return Err(
                        "Your AWS session has expired. Please run 'aws sso login' to refresh."
                            .to_string(),
                    );
                }
                return Err(format!(
                    "AWS credentials error: {}. Please run 'aws sso login' or check your AWS configuration.",
                    error_msg
                ));
            }
        }
    } else {
        return Err(
            "No AWS credentials configured. Please run 'aws sso login' or configure credentials."
                .to_string(),
        );
    }

    // Step 2: Create client and test connection
    let client = CloudWatchClient::new(&config);

    match client.describe_log_groups().limit(1).send().await {
        Ok(_) => {
            let mut config_lock = state.config.lock().await;
            *config_lock = Some(config);
            drop(config_lock);

            let mut client_lock = state.client.lock().await;
            *client_lock = Some(client);
            Ok(AwsConnectionInfo { profile, region })
        }
        Err(e) => {
            let error_msg = format!("{}", e);
            if error_msg.to_lowercase().contains("accessdenied")
                || error_msg.to_lowercase().contains("not authorized")
            {
                return Err("Access denied. Your credentials don't have permission to access CloudWatch Logs.".to_string());
            }
            Err(format!(
                "Unable to connect to AWS. Please check your network connection. ({})",
                humanize_aws_error(&error_msg)
            ))
        }
    }
}

/// List all available log groups
#[tauri::command]
async fn list_log_groups(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<LogGroup>, String> {
    let client_lock = state.client.lock().await;
    let client = client_lock.as_ref().ok_or("AWS client not initialized")?;

    let mut log_groups = Vec::new();
    let mut next_token: Option<String> = None;

    loop {
        let mut request = client.describe_log_groups();

        if let Some(token) = next_token {
            request = request.next_token(token);
        }

        match request.send().await {
            Ok(response) => {
                if let Some(groups) = response.log_groups {
                    for group in groups {
                        log_groups.push(LogGroup {
                            name: group.log_group_name.unwrap_or_default(),
                            arn: group.arn,
                            stored_bytes: group.stored_bytes,
                        });
                    }
                }

                next_token = response.next_token;
                if next_token.is_none() {
                    break;
                }
            }
            Err(e) => {
                let error_msg = format!("{}", e);
                if is_sso_session_expired(&error_msg) {
                    app.emit("aws-session-expired", ()).ok();
                }
                return Err(humanize_aws_error(&error_msg));
            }
        }
    }

    Ok(log_groups)
}

/// Fetch logs from a specific log group
#[tauri::command]
async fn fetch_logs(
    app: AppHandle,
    state: State<'_, AppState>,
    log_group_name: String,
    start_time: Option<i64>,
    end_time: Option<i64>,
    filter_pattern: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<LogEvent>, String> {
    let client_lock = state.client.lock().await;
    let client = client_lock.as_ref().ok_or("AWS client not initialized")?;

    let mut request = client.filter_log_events().log_group_name(&log_group_name);

    if let Some(start) = start_time {
        request = request.start_time(start);
    }

    if let Some(end) = end_time {
        request = request.end_time(end);
    }

    if let Some(pattern) = filter_pattern {
        if !pattern.is_empty() {
            request = request.filter_pattern(pattern);
        }
    }

    if let Some(lim) = limit {
        request = request.limit(lim);
    }

    match request.send().await {
        Ok(response) => {
            let events = response
                .events
                .unwrap_or_default()
                .into_iter()
                .map(LogEvent::from)
                .collect();
            Ok(events)
        }
        Err(e) => {
            let error_msg = format!("{}", e);
            if is_sso_session_expired(&error_msg) {
                app.emit("aws-session-expired", ()).ok();
            }
            Err(humanize_aws_error(&error_msg))
        }
    }
}

/// Fetch logs with pagination support for tailing
#[tauri::command]
async fn fetch_logs_paginated(
    app: AppHandle,
    state: State<'_, AppState>,
    log_group_name: String,
    start_time: Option<i64>,
    end_time: Option<i64>,
    filter_pattern: Option<String>,
    next_token: Option<String>,
) -> Result<(Vec<LogEvent>, Option<String>), String> {
    let client_lock = state.client.lock().await;
    let client = client_lock.as_ref().ok_or("AWS client not initialized")?;

    let mut request = client.filter_log_events().log_group_name(&log_group_name);

    if let Some(start) = start_time {
        request = request.start_time(start);
    }

    if let Some(end) = end_time {
        request = request.end_time(end);
    }

    if let Some(pattern) = filter_pattern {
        if !pattern.is_empty() {
            request = request.filter_pattern(pattern);
        }
    }

    if let Some(token) = next_token {
        request = request.next_token(token);
    }

    match request.send().await {
        Ok(response) => {
            let events = response
                .events
                .unwrap_or_default()
                .into_iter()
                .map(LogEvent::from)
                .collect();
            let new_token = response.next_token;
            Ok((events, new_token))
        }
        Err(e) => {
            let error_msg = format!("{}", e);
            if is_sso_session_expired(&error_msg) {
                app.emit("aws-session-expired", ()).ok();
            }
            Err(humanize_aws_error(&error_msg))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            // Create menu items
            let about_item = MenuItemBuilder::new("About Loggy").id("about").build(app)?;

            let preferences_item = MenuItemBuilder::new("Preferences...")
                .id("preferences")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            // App submenu (macOS application menu)
            let app_submenu = SubmenuBuilder::new(app, "Loggy")
                .item(&about_item)
                .separator()
                .item(&preferences_item)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            // Edit submenu with standard editing commands
            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            // View submenu
            let view_submenu = SubmenuBuilder::new(app, "View").fullscreen().build()?;

            // Window submenu
            let window_submenu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .separator()
                .close_window()
                .build()?;

            // Help submenu (empty for now, but required for standard macOS menu)
            let help_submenu = SubmenuBuilder::new(app, "Help").build()?;

            // Build the menu
            let menu = MenuBuilder::new(app)
                .items(&[
                    &app_submenu,
                    &edit_submenu,
                    &view_submenu,
                    &window_submenu,
                    &help_submenu,
                ])
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            let preferences_id = preferences_item.id().clone();
            let about_id = about_item.id().clone();

            app.on_menu_event(move |app_handle, event| {
                if *event.id() == preferences_id {
                    app_handle.emit("open-settings", ()).ok();
                } else if *event.id() == about_id {
                    app_handle.emit("open-about", ()).ok();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_aws_client,
            reconnect_aws,
            list_log_groups,
            fetch_logs,
            fetch_logs_paginated,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
