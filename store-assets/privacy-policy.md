# Privacy Policy — yoCareer Browser Extension

Last updated: 2026-05-10

## Data Collection

The yoCareer browser extension **does not collect, transmit, or store any personal data on remote servers**.

All data extracted from job posting pages is sent only to the local yoCareer daemon running on `127.0.0.1:8650` on your own machine.

## Data Processing

When you click the extension icon on a supported recruiting platform (BOSS直聘, 拉勾, 智联招聘), the extension extracts the following information from the page:
- Company name
- Job title / role
- Job description
- Salary range (if visible)
- Location
- Page URL

This data is immediately sent to your local yoCareer daemon via HTTP. No data leaves your computer.

## Permissions

The extension requests the following permissions:
- **activeTab**: To read the current tab's content when you click the extension icon
- **scripting**: To execute content scripts on supported platforms
- **storage**: To store the authentication token for your local daemon
- **host_permissions (127.0.0.1)**: To communicate with the local yoCareer daemon

## Third Parties

No third-party services are used. No analytics, tracking, or advertising libraries are included.

## Open Source

The full source code is available at https://github.com/ZCDeng/yoCareer under the MIT License.

## Contact

For privacy concerns, please open an issue on GitHub: https://github.com/ZCDeng/yoCareer/issues
