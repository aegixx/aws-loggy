use aws_config::BehaviorVersion;
use aws_credential_types::provider::ProvideCredentials;
use aws_sdk_cloudwatchlogs::{types::FilteredLogEvent, Client as CloudWatchClient};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::error::Error;
use std::path::PathBuf;
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
    pub current_profile: Arc<Mutex<Option<String>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            config: Arc::new(Mutex::new(None)),
            current_profile: Arc::new(Mutex::new(None)),
        }
    }
}

/// Get the AWS config directory path
fn get_aws_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".aws").join("config"))
}

/// List available AWS profiles from ~/.aws/config
#[tauri::command]
async fn list_aws_profiles() -> Result<Vec<String>, String> {
    let config_path =
        get_aws_config_path().ok_or_else(|| "Could not determine home directory".to_string())?;

    if !config_path.exists() {
        return Ok(vec!["default".to_string()]);
    }

    let contents = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read AWS config: {}", e))?;

    let mut profiles = HashSet::new();
    profiles.insert("default".to_string());

    for line in contents.lines() {
        let line = line.trim();
        // Match [profile name] or [default]
        if line.starts_with('[') && line.ends_with(']') {
            let section = &line[1..line.len() - 1];
            if section == "default" {
                profiles.insert("default".to_string());
            } else if let Some(name) = section.strip_prefix("profile ") {
                profiles.insert(name.to_string());
            }
        }
    }

    let mut profiles_vec: Vec<String> = profiles.into_iter().collect();
    profiles_vec.sort();
    Ok(profiles_vec)
}

/// Check if a profile uses SSO by looking for sso_start_url in config
fn profile_uses_sso(profile: Option<&String>) -> bool {
    get_sso_start_url(profile).is_some()
}

/// Get the SSO start URL for a profile from AWS config
fn get_sso_start_url(profile: Option<&String>) -> Option<String> {
    let config_path = get_aws_config_path()?;
    if !config_path.exists() {
        eprintln!("AWS config file not found at: {:?}", config_path);
        return None;
    }

    let contents = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to read AWS config file: {}", e);
            return None;
        }
    };

    // Determine which profile to look for
    let env_profile = std::env::var("AWS_PROFILE").ok();
    let profile_name = if let Some(p) = profile {
        p.as_str()
    } else {
        // Check environment variable or default to "default"
        env_profile.as_deref().unwrap_or("default")
    };

    eprintln!("Looking for SSO start URL for profile: {}", profile_name);

    let mut in_target_section = false;

    for line in contents.lines() {
        let line = line.trim();

        // Check if we're entering a profile section
        if line.starts_with('[') && line.ends_with(']') {
            let section = &line[1..line.len() - 1];

            if profile_name == "default" {
                // Looking for [default]
                in_target_section = section == "default";
            } else {
                // Looking for [profile name]
                if let Some(name) = section.strip_prefix("profile ") {
                    in_target_section = name == profile_name;
                } else {
                    in_target_section = false;
                }
            }
            if in_target_section {
                eprintln!("Found profile section: {}", line);
            }
            continue;
        }

        // If we're in the target section, look for sso_start_url
        if in_target_section {
            if let Some(url) = line.strip_prefix("sso_start_url") {
                // Handle both "sso_start_url = ..." and "sso_start_url=..." formats
                let url = url.trim_start_matches(|c: char| c == '=' || c.is_whitespace());
                if !url.is_empty() {
                    eprintln!("Found SSO start URL: {}", url);
                    return Some(url.to_string());
                }
            }
        }
    }

    eprintln!("SSO start URL not found for profile: {}", profile_name);
    None
}

/// Check if credentials are valid for a profile by attempting to load them
async fn check_credentials_valid(profile: Option<&String>) -> bool {
    let mut config_loader = aws_config::defaults(BehaviorVersion::latest());
    if let Some(p) = profile {
        config_loader = config_loader.profile_name(p);
    }
    let config = config_loader.load().await;

    if let Some(credentials_provider) = config.credentials_provider() {
        credentials_provider.provide_credentials().await.is_ok()
    } else {
        false
    }
}

/// Poll for valid credentials after SSO login, then emit refresh event
async fn poll_for_credentials_and_refresh(
    app: AppHandle,
    profile: Option<String>,
    max_attempts: u32,
) {
    let profile_clone = profile.clone();
    let profile_ref = profile_clone.as_ref();

    for attempt in 1..=max_attempts {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        emit_debug_log(Some(&app), &format!("Checking credentials (attempt {}/{})...", attempt, max_attempts));

        if check_credentials_valid(profile_ref).await {
            emit_debug_log(Some(&app), "Credentials are now valid! Emitting refresh event...");
            // Emit event to trigger frontend refresh
            app.emit("aws-session-refreshed", ()).ok();
            return;
        }
    }

    emit_debug_log(Some(&app), "Credentials check timeout - user may need to complete SSO login manually");
}

/// Open SSO login URL for a profile
/// This uses `aws sso login --profile` to handle the profile-aware SSO login
/// After opening, it polls for successful authentication and triggers a refresh
async fn open_sso_login_url(
    app: AppHandle,
    profile: Option<&String>,
) -> Result<(), String> {
    eprintln!("=== Attempting to open SSO URL for profile ===");

    let profile_clone = profile.cloned();

    // Use AWS CLI to handle profile-aware SSO login
    let mut cmd = std::process::Command::new("aws");
    cmd.arg("sso").arg("login");

    if let Some(p) = profile {
        cmd.arg("--profile").arg(p);
        eprintln!("Using profile: {}", p);
    } else {
        eprintln!("No profile specified, using default");
    }

    // Spawn the command - it will open the browser automatically
    match cmd.spawn() {
        Ok(_) => {
            eprintln!("Successfully started AWS SSO login");

            // Start polling for credentials to become valid (poll for up to 2 minutes)
            let app_clone = app.clone();
            tokio::spawn(async move {
                poll_for_credentials_and_refresh(app_clone, profile_clone, 60).await;
            });

            Ok(())
        }
        Err(e) => {
            eprintln!("ERROR: Failed to start AWS SSO login: {}", e);
            Err(format!("Failed to start AWS SSO login: {}", e))
        }
    }
}

/// Emit a debug log message to the frontend
fn emit_debug_log(app: Option<&AppHandle>, message: &str) {
    eprintln!("{}", message);
    if let Some(app_handle) = app {
        app_handle.emit("debug-log", message).ok();
    }
}

/// Trigger SSO login for a profile
#[tauri::command]
async fn trigger_sso_login(profile: Option<String>) -> Result<(), String> {
    let mut cmd = std::process::Command::new("aws");
    cmd.arg("sso").arg("login");

    if let Some(p) = &profile {
        cmd.arg("--profile").arg(p);
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to start SSO login: {}", e))?;

    Ok(())
}

/// Open SSO login URL in browser for a profile
#[tauri::command]
async fn open_sso_url(app: AppHandle, profile: Option<String>) -> Result<(), String> {
    open_sso_login_url(app, profile.as_ref()).await
}

/// Get the app version
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check if an error indicates the SSO session has expired (requires browser re-auth)
fn is_sso_session_expired(error_msg: &str) -> bool {
    eprintln!("Checking if error is SSO expiration: {}", error_msg);
    let error_lower = error_msg.to_lowercase();
    let is_expired = error_lower.contains("token has expired")
        || error_lower.contains("sso session")
        || error_lower.contains("refresh token")
        || error_lower.contains("re-authenticate")
        || error_lower.contains("accessdeniedexception")
        || error_lower.contains("invalid_grant")
        || error_lower.contains("expired sso token")
        || error_lower.contains("sso token")
        || (error_lower.contains("credential") && error_lower.contains("expired"))
        || (error_lower.contains("unauthorized") && error_lower.contains("token"))
        || error_lower.contains("unable to locate credentials")
        || error_lower.contains("no credentials")
        || error_lower.contains("failed to load credentials");

    if is_expired {
        eprintln!("✓ SSO expiration detected!");
    } else {
        eprintln!("✗ Not detected as SSO expiration");
    }

    is_expired
}

/// Handle SSO session expiration by opening the SSO login URL and emitting event
async fn handle_sso_expiration(
    app: &AppHandle,
    state: &State<'_, AppState>,
    profile: Option<&String>,
) {
    // Get the current profile from state if not provided
    let current_profile = if let Some(p) = profile {
        Some(p.clone())
    } else {
        state.current_profile.lock().await.clone()
    };

    // Try to open the SSO URL
    if let Err(e) = open_sso_login_url(app.clone(), current_profile.as_ref()).await {
        eprintln!("Failed to open SSO URL: {}", e);
        // Continue anyway - we'll still emit the event
    }

    // Emit the event to notify frontend
    app.emit("aws-session-expired", ()).ok();
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
/// If profile is provided, it will be used instead of the default/environment profile
#[tauri::command]
async fn init_aws_client(
    app: AppHandle,
    state: State<'_, AppState>,
    profile: Option<String>,
) -> Result<AwsConnectionInfo, String> {
    // Build config with optional profile
    let mut config_loader = aws_config::defaults(BehaviorVersion::latest());
    if let Some(ref p) = profile {
        config_loader = config_loader.profile_name(p);
    }
    let config = config_loader.load().await;

    // Use provided profile or fall back to environment variable
    let effective_profile = profile
        .clone()
        .or_else(|| std::env::var("AWS_PROFILE").ok());
    let region = config.region().map(|r| r.to_string());

    // Step 1: Verify credentials can be loaded (this catches SSO expiration, missing creds, etc.)
    if let Some(credentials_provider) = config.credentials_provider() {
        match credentials_provider.provide_credentials().await {
            Ok(_) => {
                // Credentials loaded successfully
            }
            Err(e) => {
                // Try to get more detailed error information
                let error_msg = format!("{}", e);
                let error_debug = format!("{:?}", e);
                let error_source = e.source()
                    .map(|s| format!("{}", s))
                    .unwrap_or_default();

                emit_debug_log(Some(&app), "=== Credential provider error in init_aws_client ===");
                emit_debug_log(Some(&app), &format!("Error: {}", error_msg));
                emit_debug_log(Some(&app), &format!("Error debug: {}", error_debug));
                emit_debug_log(Some(&app), &format!("Error source: {}", error_source));
                emit_debug_log(Some(&app), &format!("Profile: {:?}", effective_profile));

                // Check all error representations for SSO expiration
                let is_expired = is_sso_session_expired(&error_msg)
                    || is_sso_session_expired(&error_debug)
                    || is_sso_session_expired(&error_source);

                // If profile uses SSO and we get any credential error, assume it's SSO expiration
                let uses_sso = profile_uses_sso(effective_profile.as_ref());
                emit_debug_log(Some(&app), &format!("Profile uses SSO: {}", uses_sso));
                let should_try_sso = is_expired || (uses_sso && error_msg.contains("credential"));

                if should_try_sso {
                    // Try to open SSO URL automatically
                    emit_debug_log(Some(&app), &format!("SSO session expired detected (or SSO profile with credential error), attempting to open SSO URL for profile: {:?}", effective_profile));
                    if let Err(e) = open_sso_login_url(app.clone(), effective_profile.as_ref()).await {
                        emit_debug_log(Some(&app), &format!("Failed to open SSO URL: {}", e));
                    }
                    return Err(
                        "Your AWS session has expired. Please run 'aws sso login' to refresh."
                            .to_string(),
                    );
                }
                emit_debug_log(Some(&app), "Error does not match SSO expiration patterns, returning generic error");
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
            // Store the current profile
            let mut profile_lock = state.current_profile.lock().await;
            *profile_lock = effective_profile.clone();
            drop(profile_lock);

            // Store both client and config (config holds the credential provider for auto-refresh)
            let mut config_lock = state.config.lock().await;
            *config_lock = Some(config);
            drop(config_lock);

            let mut client_lock = state.client.lock().await;
            *client_lock = Some(client);
            Ok(AwsConnectionInfo {
                profile: effective_profile,
                region,
            })
        }
        Err(e) => {
            let error_msg = format!("{}", e);
            // Check for SSO expiration in API errors too
            if is_sso_session_expired(&error_msg) {
                // Try to open SSO URL automatically
                if let Err(e) = open_sso_login_url(app.clone(), effective_profile.as_ref()).await {
                    eprintln!("Failed to open SSO URL: {}", e);
                }
                return Err(
                    "Your AWS session has expired. Please run 'aws sso login' to refresh."
                        .to_string(),
                );
            }
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
/// If profile is provided, switches to that profile; otherwise uses the current profile
#[tauri::command]
async fn reconnect_aws(
    app: AppHandle,
    state: State<'_, AppState>,
    profile: Option<String>,
) -> Result<AwsConnectionInfo, String> {
    // Get the profile to use: provided > stored > environment
    let effective_profile = match profile {
        Some(p) => Some(p),
        None => {
            let stored = state.current_profile.lock().await;
            stored.clone().or_else(|| std::env::var("AWS_PROFILE").ok())
        }
    };

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
    let mut config_loader = aws_config::defaults(BehaviorVersion::latest());
    if let Some(ref p) = effective_profile {
        config_loader = config_loader.profile_name(p);
    }
    let config = config_loader.load().await;

    let region = config.region().map(|r| r.to_string());

    // Step 1: Verify credentials can be loaded
    if let Some(credentials_provider) = config.credentials_provider() {
        match credentials_provider.provide_credentials().await {
            Ok(_) => {
                // Credentials loaded successfully
            }
            Err(e) => {
                // Try to get more detailed error information
                let error_msg = format!("{}", e);
                let error_debug = format!("{:?}", e);
                let error_source = e.source()
                    .map(|s| format!("{}", s))
                    .unwrap_or_default();

                emit_debug_log(Some(&app), "=== Credential provider error in reconnect_aws ===");
                emit_debug_log(Some(&app), &format!("Error: {}", error_msg));
                emit_debug_log(Some(&app), &format!("Error debug: {}", error_debug));
                emit_debug_log(Some(&app), &format!("Error source: {}", error_source));
                emit_debug_log(Some(&app), &format!("Profile: {:?}", effective_profile));

                // Check all error representations for SSO expiration
                let is_expired = is_sso_session_expired(&error_msg)
                    || is_sso_session_expired(&error_debug)
                    || is_sso_session_expired(&error_source);

                // If profile uses SSO and we get any credential error, assume it's SSO expiration
                let uses_sso = profile_uses_sso(effective_profile.as_ref());
                emit_debug_log(Some(&app), &format!("Profile uses SSO: {}", uses_sso));
                let should_try_sso = is_expired || (uses_sso && error_msg.contains("credential"));

                if should_try_sso {
                    // Try to open SSO URL automatically
                    emit_debug_log(Some(&app), &format!("SSO session expired detected (or SSO profile with credential error), attempting to open SSO URL for profile: {:?}", effective_profile));
                    if let Err(e) = open_sso_login_url(app.clone(), effective_profile.as_ref()).await {
                        emit_debug_log(Some(&app), &format!("Failed to open SSO URL: {}", e));
                    }
                    return Err(
                        "Your AWS session has expired. Please run 'aws sso login' to refresh."
                            .to_string(),
                    );
                }
                emit_debug_log(Some(&app), "Error does not match SSO expiration patterns, returning generic error");
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
            // Store the current profile
            let mut profile_lock = state.current_profile.lock().await;
            *profile_lock = effective_profile.clone();
            drop(profile_lock);

            let mut config_lock = state.config.lock().await;
            *config_lock = Some(config);
            drop(config_lock);

            let mut client_lock = state.client.lock().await;
            *client_lock = Some(client);
            Ok(AwsConnectionInfo {
                profile: effective_profile,
                region,
            })
        }
        Err(e) => {
            let error_msg = format!("{}", e);
            emit_debug_log(Some(&app), &format!("API error in reconnect_aws: {}", error_msg));
            // Check for SSO expiration in API errors too
            if is_sso_session_expired(&error_msg) {
                // Try to open SSO URL automatically
                emit_debug_log(Some(&app), "SSO expiration detected in API call, opening URL");
                if let Err(e) = open_sso_login_url(app.clone(), effective_profile.as_ref()).await {
                    emit_debug_log(Some(&app), &format!("Failed to open SSO URL: {}", e));
                }
                return Err(
                    "Your AWS session has expired. Please run 'aws sso login' to refresh."
                        .to_string(),
                );
            }
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
                    handle_sso_expiration(&app, &state, None).await;
                }
                return Err(humanize_aws_error(&error_msg));
            }
        }
    }

    Ok(log_groups)
}

/// Progress update sent to frontend during log fetching
#[derive(Clone, serde::Serialize)]
struct LogsProgress {
    count: usize,
    size_bytes: usize,
}

/// Truncation info sent when limits are hit
#[derive(Clone, serde::Serialize)]
struct LogsTruncated {
    count: usize,
    size_bytes: usize,
    reason: String, // "count" or "size"
}

/// Fetch logs from a specific log group with automatic pagination
/// Fetches all available logs up to max_count or max_size_bytes, whichever is hit first
#[tauri::command]
async fn fetch_logs(
    app: AppHandle,
    state: State<'_, AppState>,
    log_group_name: String,
    start_time: Option<i64>,
    end_time: Option<i64>,
    filter_pattern: Option<String>,
    max_count: Option<i32>,
    max_size_mb: Option<i32>,
) -> Result<Vec<LogEvent>, String> {
    let client_lock = state.client.lock().await;
    let client = client_lock.as_ref().ok_or("AWS client not initialized")?;

    let max_events: usize = max_count.map(|l| l as usize).unwrap_or(50_000);
    let max_bytes: usize = max_size_mb
        .map(|mb| mb as usize * 1024 * 1024)
        .unwrap_or(100 * 1024 * 1024);
    let mut all_events: Vec<LogEvent> = Vec::new();
    let mut total_size: usize = 0;
    let mut next_token: Option<String> = None;

    loop {
        let mut request = client.filter_log_events().log_group_name(&log_group_name);

        if let Some(start) = start_time {
            request = request.start_time(start);
        }

        if let Some(end) = end_time {
            request = request.end_time(end);
        }

        if let Some(ref pattern) = filter_pattern {
            if !pattern.is_empty() {
                request = request.filter_pattern(pattern);
            }
        }

        if let Some(ref token) = next_token {
            request = request.next_token(token);
        }

        match request.send().await {
            Ok(response) => {
                let events: Vec<LogEvent> = response
                    .events
                    .unwrap_or_default()
                    .into_iter()
                    .map(LogEvent::from)
                    .collect();

                // Calculate size of new events
                let new_size: usize = events.iter().map(|e| e.message.len()).sum();
                total_size += new_size;
                all_events.extend(events);

                // Emit progress update to frontend
                app.emit(
                    "logs-progress",
                    LogsProgress {
                        count: all_events.len(),
                        size_bytes: total_size,
                    },
                )
                .ok();

                // Check for more pages
                next_token = response.next_token.clone();

                // Check if we've hit count limit
                if all_events.len() >= max_events {
                    all_events.truncate(max_events);
                    if next_token.is_some() {
                        app.emit(
                            "logs-truncated",
                            LogsTruncated {
                                count: all_events.len(),
                                size_bytes: total_size,
                                reason: "count".to_string(),
                            },
                        )
                        .ok();
                    }
                    break;
                }

                // Check if we've hit size limit
                if total_size >= max_bytes {
                    if next_token.is_some() {
                        app.emit(
                            "logs-truncated",
                            LogsTruncated {
                                count: all_events.len(),
                                size_bytes: total_size,
                                reason: "size".to_string(),
                            },
                        )
                        .ok();
                    }
                    break;
                }

                if next_token.is_none() {
                    break;
                }
            }
            Err(e) => {
                let error_msg = format!("{}", e);
                if is_sso_session_expired(&error_msg) {
                    handle_sso_expiration(&app, &state, None).await;
                }
                return Err(humanize_aws_error(&error_msg));
            }
        }
    }

    Ok(all_events)
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
                handle_sso_expiration(&app, &state, None).await;
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

            let refresh_item = MenuItemBuilder::new("Refresh")
                .id("refresh")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;

            let focus_filter_item = MenuItemBuilder::new("Search")
                .id("focus-filter")
                .accelerator("CmdOrCtrl+L")
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
            let view_submenu = SubmenuBuilder::new(app, "View")
                .item(&refresh_item)
                .item(&focus_filter_item)
                .separator()
                .fullscreen()
                .build()?;

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
            let refresh_id = refresh_item.id().clone();

            app.on_menu_event(move |app_handle, event| {
                if *event.id() == preferences_id {
                    app_handle.emit("open-settings", ()).ok();
                } else if *event.id() == about_id {
                    app_handle.emit("open-about", ()).ok();
                } else if *event.id() == refresh_id {
                    app_handle.emit("refresh-logs", ()).ok();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_aws_client,
            reconnect_aws,
            list_aws_profiles,
            trigger_sso_login,
            open_sso_url,
            get_app_version,
            list_log_groups,
            fetch_logs,
            fetch_logs_paginated,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
