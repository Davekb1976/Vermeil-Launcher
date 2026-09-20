## 1.0.0 (Experimental Build 4)

### Added

- Dynamic real-time download speed limiter in Settings with live token-bucket throughput throttling
- Floating dock auto-hide behavior with a bottom-centered tactile trigger zone and configurable delay
- Configurable pagination dock positioning in Settings (bottom centered, left centered vertical, right centered vertical)
- Dedicated pagination scroll mode keybind (default: Z) allowing mouse wheel page scrolling from anywhere on screen
- Tactile visual indicator on the pagination island when scroll mode is active

### Changed

- Standardized mouse wheel scroll direction across horizontal and vertical pagination docks so scrolling down advances to the next page
- Decoupled the pagination island from the main floating dock so pagination controls remain visible when the dock auto-hides
- Removed redundant toast alerts when toggling pagination scroll mode in favor of the illuminated tactile dock island
- Cleaned up bottom-centered dock clearance to keep the pagination island snug above the dock without clipping button tooltips

### Fixed

- Fixed overlapping UI layers in Settings where toggle switches rendered on top of open dropdown menus
- Ignored keyboard auto-repeat on shortcut triggers to prevent rapid toggle spamming when holding down keybinds
- Deduplicated install failure toasts and suppressed redundant error alerts when the manual download modal is displayed
- Clamped rate limiter token debt to ensure downloads resume instantly without artificial delay after brief pauses
