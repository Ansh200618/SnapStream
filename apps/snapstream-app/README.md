# SnapStream Desktop App

A standalone desktop application version of SnapStream with an inbuilt browser and ad-blocking capabilities.

## Features

### 🌐 Inbuilt Browser
- Full-featured web browser built with Electron
- Navigate to any website
- Back, forward, and reload controls
- URL bar with search functionality (Google search integration)
- Clean, modern interface

### 🛡️ Built-in Ad Blocker
- **Powered by @cliqz/adblocker-electron** (similar to uBlock Origin)
- Blocks ads and tracking scripts automatically
- Easy toggle on/off with visual indicator
- Uses EasyList and EasyPrivacy filter lists
- Lightweight and efficient

### 📸 Image Detection & Download
- Detects all images on any webpage
- Finds images in `<img>` tags and CSS backgrounds
- Advanced filtering options:
  - Filter by minimum width and height
  - Filter by image type (JPG, PNG, GIF, WEBP)
- Download individual images or all at once
- Clean file naming with domain and numbering

### 🎨 Modern UI
- Beautiful gradient design (Deep Indigo to Purple)
- Resizable image panel
- Real-time image preview grid
- Intuitive controls and navigation
- Status bar for feedback

## Installation

### Prerequisites
- Node.js 14+ installed
- npm 6+ installed

### Quick Start

1. **Navigate to the app directory**
   ```bash
   cd apps/snapstream-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the app**
   ```bash
   npm start
   ```

## Building the App

### Build for Your Platform

```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux
```

The built application will be available in the `dist/` folder.

## Usage

### Browsing
1. Enter a URL in the address bar or type search terms
2. Use navigation buttons to go back/forward or reload
3. The ad blocker is enabled by default (green indicator)

### Managing Ad Blocker
1. Click the "🛡️ AdBlock" button to toggle on/off
2. Green indicator = Enabled (blocks ads)
3. Red indicator = Disabled (shows ads)
4. Page automatically reloads when toggled

### Downloading Images
1. Navigate to any website
2. Click "Show Images" to open the image panel
3. Adjust filters as needed:
   - Set minimum dimensions
   - Select specific image types
4. Click "Apply Filters" to update results
5. Click individual images to download one at a time
6. Click "Download All" to save all filtered images

## Technical Details

### Technology Stack
- **Electron**: Desktop application framework
- **@cliqz/adblocker-electron**: Ad-blocking engine
- **Node.js**: Backend runtime
- **HTML/CSS/JavaScript**: Frontend

### Project Structure
```
apps/snapstream-app/
├── main.js           # Electron main process
├── preload.js        # Bridge between main and renderer
├── renderer.js       # UI logic and interactions
├── index.html        # Main UI structure
├── styles.css        # Styling and layout
├── package.json      # Dependencies and scripts
└── README.md         # This file
```

### Key Components

#### Main Process (main.js)
- Creates and manages the application window
- Initializes the ad blocker
- Handles IPC communication for downloads
- Manages application menu

#### Renderer Process (renderer.js)
- Handles UI interactions
- Manages webview navigation
- Detects and filters images
- Communicates with main process

#### Preload Script (preload.js)
- Securely exposes Electron APIs to renderer
- Implements context isolation for security

## Ad Blocker Details

The built-in ad blocker uses the same filter lists as popular ad blockers:
- **EasyList**: Blocks most advertisements
- **EasyPrivacy**: Blocks tracking and analytics

### How It Works
1. Loads filter lists on application startup
2. Intercepts network requests in the webview
3. Blocks requests matching ad/tracker patterns
4. Allows normal content through

### Performance
- Minimal impact on browsing speed
- Filter lists are cached for efficiency
- Runs in the background without user intervention

## Keyboard Shortcuts

- `Ctrl/Cmd + T`: New tab (resets to Google)
- `Ctrl/Cmd + R`: Reload page
- `Ctrl/Cmd + Q`: Quit application

## Troubleshooting

### App won't start
- Ensure all dependencies are installed: `npm install`
- Check Node.js version: `node --version` (should be 14+)

### Ad blocker not working
- Check the button status (should show green when enabled)
- Try toggling it off and on again
- Reload the current page

### Images not detected
- Ensure the page has finished loading
- Try reloading the page and clicking "Show Images" again
- Some images may be loaded dynamically after page load

### Download issues
- Check that you have write permissions to the selected folder
- Ensure the image URLs are accessible
- Some websites may block direct image downloads

## Development

### Running in Development Mode
```bash
npm start
```

This will start the Electron app with the current code.

### Making Changes
1. Edit the source files (main.js, renderer.js, etc.)
2. Restart the app to see changes
3. For hot reloading, consider using electron-reloader

### Debugging
- Press `F12` or `Ctrl/Cmd + Shift + I` to open DevTools
- Check the console for errors and logs
- Use `console.log()` in renderer.js for debugging UI logic
- Check the terminal for main process logs

## License

MIT License - Same as the parent SnapStream project

## Credits

Built on top of SnapStream by Ansh200618
- Ad blocking powered by @cliqz/adblocker-electron
- Desktop framework by Electron
- Filter lists from EasyList and EasyPrivacy

## Support

For issues, questions, or contributions, please visit:
- Main Repository: https://github.com/Ansh200618/SnapStream
- Issues: https://github.com/Ansh200618/SnapStream/issues

---

**Made with ❤️ by [Ansh200618](https://github.com/Ansh200618)**
