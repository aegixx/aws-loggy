# Changelog

## [1.4.0](https://github.com/aegixx/aws-loggy/compare/v1.3.5...v1.4.0) (2025-11-26)


### Features

* Add status bar, cache limits, and pagination for log fetching ([c1628a0](https://github.com/aegixx/aws-loggy/commit/c1628a01d539310271087a8cbcf7b1d45fb6b50d))
* Add System log level, keyboard shortcuts, and UX improvements ([24c1937](https://github.com/aegixx/aws-loggy/commit/24c1937375bc26a1a054b20f86991b54f37f07fd))


### Miscellaneous

* Updated Cargo.lock ([a4dc293](https://github.com/aegixx/aws-loggy/commit/a4dc2939229f0a04086581c2bdd2b62f6aef8e44))

## [1.3.5](https://github.com/aegixx/aws-loggy/compare/v1.3.4...v1.3.5) (2025-11-26)


### Bug Fixes

* **ci:** hold release as draft until all artifacts are ready ([3d6e040](https://github.com/aegixx/aws-loggy/commit/3d6e04060879c642d5573ddc217de7d5eeefcd95))

## [1.3.4](https://github.com/aegixx/aws-loggy/compare/v1.3.3...v1.3.4) (2025-11-26)


### Bug Fixes

* **ci:** correct assetNamePattern parameter name ([7a0a967](https://github.com/aegixx/aws-loggy/commit/7a0a967af8e971ddcb5cc538cd53529620de8e14))

## [1.3.3](https://github.com/aegixx/aws-loggy/compare/v1.3.2...v1.3.3) (2025-11-26)


### Bug Fixes

* **ci:** chain release workflow from release-please ([caf7d3b](https://github.com/aegixx/aws-loggy/commit/caf7d3b346ff6c82aef7c41465a3b58218f2e5d1))

## [1.3.2](https://github.com/aegixx/aws-loggy/compare/v1.3.1...v1.3.2) (2025-11-26)


### Bug Fixes

* correct directory name in README installation instructions ([78dfcbb](https://github.com/aegixx/aws-loggy/commit/78dfcbb66b47f8ed68202caaa8a54b066bb0902e))

## [1.3.1](https://github.com/aegixx/aws-loggy/compare/v1.3.0...v1.3.1) (2025-11-26)


### Bug Fixes

* disable ad-hoc code signing for macOS builds ([5912375](https://github.com/aegixx/aws-loggy/commit/591237503f8e41c9cbceb335641d42be338ab922))
* use correct signingIdentity field for macOS config ([7c4b47b](https://github.com/aegixx/aws-loggy/commit/7c4b47bc7b56872960b799c2296e5308f9230a66))
* use friendly names for release binaries ([36fd3f2](https://github.com/aegixx/aws-loggy/commit/36fd3f2c30acab1472ea5aae45aae87196fbb78c))

## [1.3.0](https://github.com/aegixx/aws-loggy/compare/v1.2.1...v1.3.0) (2025-11-26)


### Features

* add GitHub Actions CI/CD pipeline with auto-versioning ([443af77](https://github.com/aegixx/aws-loggy/commit/443af77c0f57d795a7ab714ac261c0896c72c620))
* add GitHub Actions CI/CD pipeline with auto-versioning ([f2ef55f](https://github.com/aegixx/aws-loggy/commit/f2ef55fc027cf6ed3d653cb1a17b6e9cdcf9d482))


### Bug Fixes

* **ci:** disable Rust linters in trunk (clippy, rustfmt) ([9806054](https://github.com/aegixx/aws-loggy/commit/98060546edf7a3c95147c739290e43cc3bee5bb7))
* **ci:** disable svgo and oxipng due to ESM compatibility issues ([dd2052f](https://github.com/aegixx/aws-loggy/commit/dd2052f6d0d581afd1e7697f34a3a46966258c2a))
* **ci:** exclude Rust linters from trunk-action ([5c3c75e](https://github.com/aegixx/aws-loggy/commit/5c3c75e220840b5d740a7a6172514ca3aeeabd7c))
* **ci:** ignore CHANGELOG.md from all linters and use v*.*.* tags ([f0f8b1f](https://github.com/aegixx/aws-loggy/commit/f0f8b1f6f6e50fafe7ef013ee506a886064c4cc6))
* **ci:** ignore osv-scanner for Cargo.lock upstream dependencies ([2deb15d](https://github.com/aegixx/aws-loggy/commit/2deb15d4641efc2d230ed768ab7c0620924785bc))
* **ci:** ignore Rust linters for src-tauri in trunk config ([70af1f8](https://github.com/aegixx/aws-loggy/commit/70af1f83f86e8e4e95e066b3f840db09ef06105d))
* **ci:** migrate trunk check-mode and update screenshot ([a6ec8ea](https://github.com/aegixx/aws-loggy/commit/a6ec8ea2757c8bebfbcc6c2c3bed1678b0c0a7d8))
* **ci:** remove duplicate workflow runs on feature branches ([90a9614](https://github.com/aegixx/aws-loggy/commit/90a96149f67c2206035333be5bce72001b893b76))


### Miscellaneous

* cleanup CHANGELOG duplicates and update Cargo.lock ([a570058](https://github.com/aegixx/aws-loggy/commit/a570058da71489243dfb2f7db69417325f8a630a))
* **main:** release loggy 1.2.0 ([ea3a0f9](https://github.com/aegixx/aws-loggy/commit/ea3a0f97af98a2f510f7782a0a4a70037f27ac7b))
* **main:** release loggy 1.2.0 ([9893faf](https://github.com/aegixx/aws-loggy/commit/9893faf4dd1699ecd2496a98c888195c1c6754c0))
* **main:** release loggy 1.2.1 ([72c093c](https://github.com/aegixx/aws-loggy/commit/72c093ce41331497b529c111d57054a5d59bc0ff))
* **main:** release loggy 1.2.1 ([d5c0deb](https://github.com/aegixx/aws-loggy/commit/d5c0debd09ba0aaba9ad583521cf6b55d53e5703))
* remove unused image imports in App.tsx ([1fc485f](https://github.com/aegixx/aws-loggy/commit/1fc485ff4598d76b9bceb6056523cea09860ee1d))
* update bundle identifier to dev.steampunk domain ([4a387f5](https://github.com/aegixx/aws-loggy/commit/4a387f58299f08416c4f57a80b8b280a9576d8aa))
* update Cargo.lock for version 1.2.0 ([2872ec8](https://github.com/aegixx/aws-loggy/commit/2872ec8279bcd1c1c6b5f901982f1c1e18728265))

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
