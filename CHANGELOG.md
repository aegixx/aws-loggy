# Changelog

## [2.0.2](https://github.com/aegixx/aws-loggy/compare/v2.0.1...v2.0.2) (2026-01-16)


### Continuous Integration

* only run Claude Code Review on feature PRs ([d16e0bc](https://github.com/aegixx/aws-loggy/commit/d16e0bc674ef0a667998b04aa99b8c16f646a19f))

## [2.0.1](https://github.com/aegixx/aws-loggy/compare/v2.0.0...v2.0.1) (2026-01-16)


### Bug Fixes

* clean up corrupted CHANGELOG entries ([6f8ebe4](https://github.com/aegixx/aws-loggy/commit/6f8ebe4d812af2f3b39d800d89647e7aa710dac3))
* use PAT for release-please to enable workflow triggers ([cbdd5f4](https://github.com/aegixx/aws-loggy/commit/cbdd5f4de27578085725ee833a2607bd8a0409fd))

## [2.0.0](https://github.com/aegixx/aws-loggy/compare/v1.12.0...v2.0.0) (2026-01-16)


### ⚠ BREAKING CHANGES

* release 2.0.0

### Features

* release 2.0.0 ([d7812da](https://github.com/aegixx/aws-loggy/commit/d7812da147dbdfaf01da1e6e794bbde1e7c21203))

## [1.12.0](https://github.com/aegixx/aws-loggy/compare/v1.11.0...v1.12.0) (2026-01-16)

_No user-facing changes. Release metadata update only._

## [1.11.0](https://github.com/aegixx/aws-loggy/compare/v1.10.0...v1.11.0) (2026-01-16)


### Features

* add Tauri recommended Cargo release optimizations ([#30](https://github.com/aegixx/aws-loggy/issues/30)) ([243e998](https://github.com/aegixx/aws-loggy/commit/243e998cc114786d27522e1b62613120292fc4ac)), closes [#28](https://github.com/aegixx/aws-loggy/issues/28)


### Code Quality

* comprehensive code review remediation ([#29](https://github.com/aegixx/aws-loggy/issues/29)) ([33ca66b](https://github.com/aegixx/aws-loggy/commit/33ca66b)):
  - Security hardening (CSP, ReDoS protection, input validation)
  - Performance improvements (memoization, debouncing, optimized filtering)
  - Architecture refactoring (LogViewer reduced 36%, extracted reusable hooks)
  - Rust backend improvements (proper logging, AWS CLI timeout, SSO error handling)

## [1.10.0](https://github.com/aegixx/aws-loggy/compare/v1.9.0...v1.10.0) (2025-12-29)


### Features

* add Find functionality to maximized log view ([c790e16](https://github.com/aegixx/aws-loggy/commit/c790e16a687c0e128258fddc3557de71e9e425bb))
* add maximize view for log records ([0789825](https://github.com/aegixx/aws-loggy/commit/0789825a39cda3949f9208bc9bed8aeebfe1cbcd))

## [1.9.0](https://github.com/aegixx/aws-loggy/compare/v1.8.1...v1.9.0) (2025-12-29)


### Features

* add right-click context menu for log rows ([e6d028c](https://github.com/aegixx/aws-loggy/commit/e6d028cc40f13107cd41599906dbcaa4d6be3bb1))
* enhance context menu with Filter by submenu ([be09a47](https://github.com/aegixx/aws-loggy/commit/be09a4791c11d84c4fc8ec53fb878526187a7dc7))
* improve date picker UX with auto-adjustment ([4f23f0f](https://github.com/aegixx/aws-loggy/commit/4f23f0fb390fcd382c4ecd5aec0565f84a0142b5))
* show disconnected state when session expires during streaming ([0010636](https://github.com/aegixx/aws-loggy/commit/001063668acf15f1601453e7f74bf276a95fbf19))


### Bug Fixes

* Add manual release trigger ([c148c8f](https://github.com/aegixx/aws-loggy/commit/c148c8f9c136c02f87d08a13c5109e7bdbc70fd5))
* auto-delete release PR branches after merge ([c0e5260](https://github.com/aegixx/aws-loggy/commit/c0e5260fcb9112ae4814ef491cb922cb8ec1dfe2))
* guard fromJSON calls in release-please workflow ([f5ca5fb](https://github.com/aegixx/aws-loggy/commit/f5ca5fb80fb1c5727b227f3a96909af49d778d9b))


### Performance Improvements

* optimize handling of large log messages ([c378e20](https://github.com/aegixx/aws-loggy/commit/c378e2080a8335a81a5e7e53bf07e249c31da187))


### Documentation

* add missing Cmd-F shortcut to DESIGN.md ([0af3a2a](https://github.com/aegixx/aws-loggy/commit/0af3a2aa59b57a91b318b3f1576b33d9754812f3))

## [1.8.1](https://github.com/aegixx/aws-loggy/compare/v1.8.0...v1.8.1) (2025-12-23)


### Bug Fixes

* improve JSON expand/collapse UX in expanded log view ([5331e41](https://github.com/aegixx/aws-loggy/commit/5331e412b3a76c628f52e7fe603de76e1b12a2ff))

## [1.8.0](https://github.com/aegixx/aws-loggy/compare/v1.7.1...v1.8.0) (2025-12-22)


### Features

* add find-in-logs, theme menu, and UX improvements ([#23](https://github.com/aegixx/aws-loggy/issues/23)) ([b18f0a8](https://github.com/aegixx/aws-loggy/commit/b18f0a85b2e516b3becc7e1755b7db248746fe9e))

## [1.7.1](https://github.com/aegixx/aws-loggy/compare/v1.7.0...v1.7.1) (2025-12-18)


### Bug Fixes

* ensure lock files are included in release PRs ([9367f9e](https://github.com/aegixx/aws-loggy/commit/9367f9ed87e329db718e683ab282b02aacbaff1d))

## [1.7.0](https://github.com/aegixx/aws-loggy/compare/v1.6.1...v1.7.0) (2025-12-18)


### Features

* add drag-select to copy multiple log messages ([a696e6b](https://github.com/aegixx/aws-loggy/commit/a696e6bfde2c533b948e34dd2fccf7cb49c16b10))


### Miscellaneous

* update Cargo.lock version ([79b93aa](https://github.com/aegixx/aws-loggy/commit/79b93aaedf01aa19476b0599e1c3d28554ca2355))

## [1.6.1](https://github.com/aegixx/aws-loggy/compare/v1.6.0...v1.6.1) (2025-12-10)


### Bug Fixes

* resolve tailing bugs when clearing logs and resetting filters ([bf566bb](https://github.com/aegixx/aws-loggy/commit/bf566bb52b9d9a1fdd72cb601674f0f04ce73f5f))

## [1.6.0](https://github.com/aegixx/aws-loggy/compare/v1.5.6...v1.6.0) (2025-12-10)


### Features

* add react-datepicker for custom date range and Material icons ([360acbc](https://github.com/aegixx/aws-loggy/commit/360acbc2b30e9f56ba43d7a850b0007462a78a06))

## [1.5.6](https://github.com/aegixx/aws-loggy/compare/v1.5.5...v1.5.6) (2025-11-27)


### Bug Fixes

* use cargo update to update Cargo.lock version in release workflow ([adcf8c7](https://github.com/aegixx/aws-loggy/commit/adcf8c7f235eb2308c0b66244c71898c13bb0a07))


### Miscellaneous

* update Cargo.lock version to 1.5.5 ([c0e452c](https://github.com/aegixx/aws-loggy/commit/c0e452c775c4289edbaa07af02af692a49b7a86f))

## [1.5.5](https://github.com/aegixx/aws-loggy/compare/v1.5.4...v1.5.5) (2025-11-27)


### Miscellaneous

* updated trunk config ([747d097](https://github.com/aegixx/aws-loggy/commit/747d0977d4c10ade392d6a9aef40e46faf3b73a4))

## [1.5.4](https://github.com/aegixx/aws-loggy/compare/v1.5.3...v1.5.4) (2025-11-27)

### Bug Fixes

- install Linux dependencies before cargo check ([a85721c](https://github.com/aegixx/aws-loggy/commit/a85721c5f41fe93ac1f660eff5aa7942ce071f66))

### Miscellaneous

- update Cargo.lock version to 1.5.2 ([36166c2](https://github.com/aegixx/aws-loggy/commit/36166c28691931b70e36acb41e26e3907b4eab3d))
- update Cargo.lock version to 1.5.3 ([206d435](https://github.com/aegixx/aws-loggy/commit/206d4358f5e8c2f51aed99607380550134a091ad))

## [1.5.3](https://github.com/aegixx/aws-loggy/compare/v1.5.2...v1.5.3) (2025-11-27)

### Bug Fixes

- use GitHub Actions fromJSON for PR branch parsing ([0330d54](https://github.com/aegixx/aws-loggy/commit/0330d5446cda6156fab25f3c023b54be2a439244))

## [1.5.2](https://github.com/aegixx/aws-loggy/compare/v1.5.1...v1.5.2) (2025-11-27)

### Miscellaneous

- update Cargo.lock version to 1.5.1 ([906275a](https://github.com/aegixx/aws-loggy/commit/906275af870f537b58f3e4f9ed2f4c86d8e9c514))

### Continuous Integration

- auto-update lock files in release PRs ([104eb0b](https://github.com/aegixx/aws-loggy/commit/104eb0b8180319d7f06e00b256e74a3fbed40175))

## [1.5.1](https://github.com/aegixx/aws-loggy/compare/v1.5.0...v1.5.1) (2025-11-27)

### Miscellaneous

- Updated README ([0399912](https://github.com/aegixx/aws-loggy/commit/0399912b76b02f939ad48617442e3f27fa24df27))

## [1.5.0](https://github.com/aegixx/aws-loggy/compare/v1.4.0...v1.5.0) (2025-11-26)

### Features

- Add Apple code signing and notarization to release workflow ([b9cb1d7](https://github.com/aegixx/aws-loggy/commit/b9cb1d7c0b9173b5116b898c3c01b01bb19cc7a3))
- Enable auto-merge for release-please PRs ([1d2a73a](https://github.com/aegixx/aws-loggy/commit/1d2a73a51e9a5a37ae3334fc1525494c5a6b6e57))

### Bug Fixes

- Allow auto-merge to fail gracefully for workflow changes ([ef795bf](https://github.com/aegixx/aws-loggy/commit/ef795bfa4b75e165121d2e91161aee2cb58dfb4d))
- Parse PR number from release-please JSON output ([1f47a8f](https://github.com/aegixx/aws-loggy/commit/1f47a8ff50434adf5095152cc75b6f5528dc2e79))

### Miscellaneous

- Enable ad-hoc signing and rename menu item ([997128a](https://github.com/aegixx/aws-loggy/commit/997128a692c67c9ea1f6c5664841c36511bb47d1))
- Update Cargo.lock ([1e33846](https://github.com/aegixx/aws-loggy/commit/1e338464d35a556d678ec9348041a39e5e7ac424))

## [1.4.0](https://github.com/aegixx/aws-loggy/compare/v1.3.5...v1.4.0) (2025-11-26)

### Features

- Add status bar, cache limits, and pagination for log fetching ([c1628a0](https://github.com/aegixx/aws-loggy/commit/c1628a01d539310271087a8cbcf7b1d45fb6b50d))
- Add System log level, keyboard shortcuts, and UX improvements ([24c1937](https://github.com/aegixx/aws-loggy/commit/24c1937375bc26a1a054b20f86991b54f37f07fd))

### Miscellaneous

- Updated Cargo.lock ([a4dc293](https://github.com/aegixx/aws-loggy/commit/a4dc2939229f0a04086581c2bdd2b62f6aef8e44))

## [1.3.5](https://github.com/aegixx/aws-loggy/compare/v1.3.4...v1.3.5) (2025-11-26)

### Bug Fixes

- **ci:** hold release as draft until all artifacts are ready ([3d6e040](https://github.com/aegixx/aws-loggy/commit/3d6e04060879c642d5573ddc217de7d5eeefcd95))

## [1.3.4](https://github.com/aegixx/aws-loggy/compare/v1.3.3...v1.3.4) (2025-11-26)

### Bug Fixes

- **ci:** correct assetNamePattern parameter name ([7a0a967](https://github.com/aegixx/aws-loggy/commit/7a0a967af8e971ddcb5cc538cd53529620de8e14))

## [1.3.3](https://github.com/aegixx/aws-loggy/compare/v1.3.2...v1.3.3) (2025-11-26)

### Bug Fixes

- **ci:** chain release workflow from release-please ([caf7d3b](https://github.com/aegixx/aws-loggy/commit/caf7d3b346ff6c82aef7c41465a3b58218f2e5d1))

## [1.3.2](https://github.com/aegixx/aws-loggy/compare/v1.3.1...v1.3.2) (2025-11-26)

### Bug Fixes

- correct directory name in README installation instructions ([78dfcbb](https://github.com/aegixx/aws-loggy/commit/78dfcbb66b47f8ed68202caaa8a54b066bb0902e))

## [1.3.1](https://github.com/aegixx/aws-loggy/compare/v1.3.0...v1.3.1) (2025-11-26)

### Bug Fixes

- disable ad-hoc code signing for macOS builds ([5912375](https://github.com/aegixx/aws-loggy/commit/591237503f8e41c9cbceb335641d42be338ab922))
- use correct signingIdentity field for macOS config ([7c4b47b](https://github.com/aegixx/aws-loggy/commit/7c4b47bc7b56872960b799c2296e5308f9230a66))
- use friendly names for release binaries ([36fd3f2](https://github.com/aegixx/aws-loggy/commit/36fd3f2c30acab1472ea5aae45aae87196fbb78c))

## [1.3.0](https://github.com/aegixx/aws-loggy/compare/v1.2.1...v1.3.0) (2025-11-26)

### Features

- add GitHub Actions CI/CD pipeline with auto-versioning ([443af77](https://github.com/aegixx/aws-loggy/commit/443af77c0f57d795a7ab714ac261c0896c72c620))
- add GitHub Actions CI/CD pipeline with auto-versioning ([f2ef55f](https://github.com/aegixx/aws-loggy/commit/f2ef55fc027cf6ed3d653cb1a17b6e9cdcf9d482))

### Bug Fixes

- **ci:** disable Rust linters in trunk (clippy, rustfmt) ([9806054](https://github.com/aegixx/aws-loggy/commit/98060546edf7a3c95147c739290e43cc3bee5bb7))
- **ci:** disable svgo and oxipng due to ESM compatibility issues ([dd2052f](https://github.com/aegixx/aws-loggy/commit/dd2052f6d0d581afd1e7697f34a3a46966258c2a))
- **ci:** exclude Rust linters from trunk-action ([5c3c75e](https://github.com/aegixx/aws-loggy/commit/5c3c75e220840b5d740a7a6172514ca3aeeabd7c))
- **ci:** ignore CHANGELOG.md from all linters and use v*.*.\* tags ([f0f8b1f](https://github.com/aegixx/aws-loggy/commit/f0f8b1f6f6e50fafe7ef013ee506a886064c4cc6))
- **ci:** ignore osv-scanner for Cargo.lock upstream dependencies ([2deb15d](https://github.com/aegixx/aws-loggy/commit/2deb15d4641efc2d230ed768ab7c0620924785bc))
- **ci:** ignore Rust linters for src-tauri in trunk config ([70af1f8](https://github.com/aegixx/aws-loggy/commit/70af1f83f86e8e4e95e066b3f840db09ef06105d))
- **ci:** migrate trunk check-mode and update screenshot ([a6ec8ea](https://github.com/aegixx/aws-loggy/commit/a6ec8ea2757c8bebfbcc6c2c3bed1678b0c0a7d8))
- **ci:** remove duplicate workflow runs on feature branches ([90a9614](https://github.com/aegixx/aws-loggy/commit/90a96149f67c2206035333be5bce72001b893b76))

### Miscellaneous

- cleanup CHANGELOG duplicates and update Cargo.lock ([a570058](https://github.com/aegixx/aws-loggy/commit/a570058da71489243dfb2f7db69417325f8a630a))
- **main:** release loggy 1.2.0 ([ea3a0f9](https://github.com/aegixx/aws-loggy/commit/ea3a0f97af98a2f510f7782a0a4a70037f27ac7b))
- **main:** release loggy 1.2.0 ([9893faf](https://github.com/aegixx/aws-loggy/commit/9893faf4dd1699ecd2496a98c888195c1c6754c0))
- **main:** release loggy 1.2.1 ([72c093c](https://github.com/aegixx/aws-loggy/commit/72c093ce41331497b529c111d57054a5d59bc0ff))
- **main:** release loggy 1.2.1 ([d5c0deb](https://github.com/aegixx/aws-loggy/commit/d5c0debd09ba0aaba9ad583521cf6b55d53e5703))
- remove unused image imports in App.tsx ([1fc485f](https://github.com/aegixx/aws-loggy/commit/1fc485ff4598d76b9bceb6056523cea09860ee1d))
- update bundle identifier to dev.steampunk domain ([4a387f5](https://github.com/aegixx/aws-loggy/commit/4a387f58299f08416c4f57a80b8b280a9576d8aa))
- update Cargo.lock for version 1.2.0 ([2872ec8](https://github.com/aegixx/aws-loggy/commit/2872ec8279bcd1c1c6b5f901982f1c1e18728265))

## [1.2.1](https://github.com/aegixx/aws-loggy/compare/loggy-v1.2.0...loggy-v1.2.1) (2025-11-26)

### Bug Fixes

- **ci:** migrate trunk check-mode and update screenshot ([a6ec8ea](https://github.com/aegixx/aws-loggy/commit/a6ec8ea2757c8bebfbcc6c2c3bed1678b0c0a7d8))

### Miscellaneous

- update Cargo.lock for version 1.2.0 ([2872ec8](https://github.com/aegixx/aws-loggy/commit/2872ec8279bcd1c1c6b5f901982f1c1e18728265))

## [1.2.0](https://github.com/aegixx/aws-loggy/compare/loggy-v1.1.0...loggy-v1.2.0) (2025-11-26)

### Features

- add GitHub Actions CI/CD pipeline with auto-versioning ([f2ef55f](https://github.com/aegixx/aws-loggy/commit/f2ef55fc027cf6ed3d653cb1a17b6e9cdcf9d482))

### Bug Fixes

- **ci:** disable Rust linters in trunk (clippy, rustfmt) ([9806054](https://github.com/aegixx/aws-loggy/commit/98060546edf7a3c95147c739290e43cc3bee5bb7))
- **ci:** disable svgo and oxipng due to ESM compatibility issues ([dd2052f](https://github.com/aegixx/aws-loggy/commit/dd2052f6d0d581afd1e7697f34a3a46966258c2a))
- **ci:** ignore osv-scanner for Cargo.lock upstream dependencies ([2deb15d](https://github.com/aegixx/aws-loggy/commit/2deb15d4641efc2d230ed768ab7c0620924785bc))
- **ci:** remove duplicate workflow runs on feature branches ([90a9614](https://github.com/aegixx/aws-loggy/commit/90a96149f67c2206035333be5bce72001b893b76))

### Miscellaneous

- remove unused image imports in App.tsx ([1fc485f](https://github.com/aegixx/aws-loggy/commit/1fc485ff4598d76b9bceb6056523cea09860ee1d))
- update bundle identifier to dev.steampunk domain ([4a387f5](https://github.com/aegixx/aws-loggy/commit/4a387f58299f08416c4f57a80b8b280a9576d8aa))
