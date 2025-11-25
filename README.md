# Loggy

A fast, native desktop app for browsing and tailing AWS CloudWatch logs.

![Loggy Screenshot](media/screenshot.png)

## Features

- **Live Log Tailing** - Stream new log events in real-time with auto-scroll
- **Instant Filtering** - Client-side filtering as you type (no AWS roundtrip)
- **JSON Query Syntax** - Filter by JSON fields with `field:value` or `field.nested:value`
- **Log Level Detection** - Automatic colorization based on log level (ERROR, WARN, INFO, DEBUG)
- **JSON Syntax Highlighting** - Collapsible, colorized JSON viewer for structured logs
- **Virtualized Rendering** - Smooth scrolling through 50,000+ log entries
- **Native Performance** - Built with Tauri for small bundle size and low memory usage

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (latest stable)
- AWS credentials configured via:
  - AWS CLI profiles (`~/.aws/credentials`)
  - AWS SSO
  - Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
  - IAM roles (when running on EC2/ECS)

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/aegixx/aws-loggy.git
cd loggy

# Install dependencies
npm install

# Run in development mode
npm start

# Build for production
npm run app:build
```

The built application will be in `src-tauri/target/release/bundle/`.

### Pre-built Binaries

Coming soon - check the [Releases](https://github.com/aegixx/aws-loggy/releases) page.

## Usage

1. **Select AWS Profile** - Loggy uses your default AWS credentials.

2. **Choose Log Group** - Use the dropdown to select a CloudWatch log group from your account.

3. **Browse Logs** - View historical logs with automatic time range selection.

4. **Live Tail** - Click the tail button to stream new logs in real-time.

5. **Filter Logs** - Type in the filter bar to instantly filter displayed logs:
   - Simple text: `error` matches any log containing "error"
   - JSON field: `level:error` matches logs where the `level` JSON field equals "error"
   - Nested field: `user.id:123` matches nested JSON fields

6. **Toggle Log Levels** - Click level badges (ERROR, WARN, INFO, DEBUG) to show/hide specific levels.

7. **View Details** - Click any log row to expand and see the full message with JSON highlighting.

## Development

```bash
# Run with hot reload
npm start

# Format code
npm run fmt

# Lint code
npm run lint

# Build production app
npm run app:build
```

### Tech Stack

- **Backend**: [Tauri 2.x](https://tauri.app/), Rust, [AWS SDK for Rust](https://aws.amazon.com/sdk-for-rust/)
- **Frontend**: React 19, TypeScript, [Zustand](https://zustand-demo.pmnd.rs/), [react-window](https://github.com/bvaughn/react-window), Tailwind CSS v4

### Project Structure

```text
loggy/
├── src-tauri/          # Rust backend
│   └── src/lib.rs      # Tauri commands & AWS integration
├── src/                # React frontend
│   ├── components/     # UI components
│   ├── stores/         # Zustand state management
│   └── types/          # TypeScript definitions
├── DESIGN.md           # Architecture documentation
└── CLAUDE.md           # AI assistant instructions
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run formatting and linting (`npm run fmt && npm run lint`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) for the excellent desktop framework
- The AWS SDK team for the Rust SDK
