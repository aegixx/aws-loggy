use aws_config::BehaviorVersion;
use aws_sdk_cloudwatchlogs::{types::FilteredLogEvent, Client as CloudWatchClient};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
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

    let client = CloudWatchClient::new(&config);

    // Get profile from environment
    let profile = std::env::var("AWS_PROFILE").ok();
    let region = config.region().map(|r| r.to_string());

    // Test the connection by describing log groups
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
        Err(e) => Err(format!("Failed to connect to AWS: {}", e)),
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
    let client = CloudWatchClient::new(&config);

    let profile = std::env::var("AWS_PROFILE").ok();
    let region = config.region().map(|r| r.to_string());

    match client.describe_log_groups().limit(1).send().await {
        Ok(_) => {
            let mut config_lock = state.config.lock().await;
            *config_lock = Some(config);
            drop(config_lock);

            let mut client_lock = state.client.lock().await;
            *client_lock = Some(client);
            Ok(AwsConnectionInfo { profile, region })
        }
        Err(e) => Err(format!("Failed to reconnect to AWS: {}", e)),
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
                return Err(format!("Failed to list log groups: {}", e));
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
            Err(format!("Failed to fetch logs: {}", e))
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
            Err(format!("Failed to fetch logs: {}", e))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
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
