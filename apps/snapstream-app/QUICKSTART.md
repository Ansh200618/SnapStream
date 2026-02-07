# SnapStream Desktop - Quick Start Guide

## 🚀 Getting Started

### Installation

1. **Navigate to the app directory:**
   ```bash
   cd apps/snapstream-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   
   This will install:
   - Electron (desktop framework)
   - @cliqz/adblocker-electron (ad blocker)
   - electron-builder (for creating distributable packages)

3. **Start the app:**
   ```bash
   npm start
   ```

   The SnapStream Desktop application will launch!

## 🎯 Features Overview

### Inbuilt Browser
- Navigate to any website using the address bar
- Back, forward, and reload controls
- Google search integration (just type your query)
- Modern, fast browsing experience

### Built-in Ad Blocker 🛡️
- **Automatically enabled** when you start the app
- Uses the same filter lists as uBlock Origin (EasyList + EasyPrivacy)
- Toggle on/off with the shield button
- Page automatically reloads when toggled

### SnapStream Image Detection 📸
1. Navigate to any website
2. Click the camera button (📸) to open the SnapStream panel
3. Images are automatically detected and displayed
4. Use filters to narrow down results:
   - Filter by URL patterns
   - Set minimum/maximum dimensions
   - Filter by image type
5. Click individual images to download or select multiple
6. Click "Download All" to save all filtered images

## 🔧 Usage Tips

### Browsing
- **URL Bar:** Type a URL or search term
- **Navigation:** Use browser buttons or keyboard shortcuts
- **Ad Blocker:** Green shield = ON, Red shield = OFF

### Image Detection
- **Auto-detect:** Images are found automatically when you open the panel
- **Refresh:** Click the refresh button to rescan the page
- **Filters:** Use advanced filters for precise control
- **Selection:** Click images to select/deselect them

### Downloading
- **Single Image:** Click on an image card
- **Multiple Images:** Select multiple, then click "Download All"
- **File Naming:** Images are named automatically (snapstream_domain_001.jpg, etc.)

## 🏗️ Building for Distribution

Create installable packages for your platform:

```bash
# Build for your current platform
npm run build

# Build for specific platforms
npm run build:win      # Windows installer
npm run build:mac      # macOS DMG
npm run build:linux    # Linux AppImage
```

Built packages will be in the `dist/` folder.

## 🐛 Troubleshooting

### App won't start
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm start
```

### Ad blocker not working
- Check the shield button status (should be green)
- Try toggling it off and on
- Reload the current page

### Images not detected
- Make sure the page has finished loading
- Click the refresh button in the SnapStream panel
- Some sites load images dynamically; try scrolling first

### Download issues
- Check your downloads folder permissions
- Some sites may block direct image downloads
- Try right-clicking the image and selecting "Save As"

## 📝 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + T` | New tab (reset to Google) |
| `Ctrl/Cmd + R` | Reload page |
| `Ctrl/Cmd + Q` | Quit application |
| `F12` | Open DevTools (for debugging) |

## 🔒 Security & Privacy

- Ad blocker runs locally (no data sent to servers)
- No tracking or analytics
- Images are downloaded directly to your computer
- All data stays on your device

## 💡 Advanced Features

### Custom Filter Lists
The ad blocker uses EasyList and EasyPrivacy by default. To add custom lists, you can modify `main.js`.

### Storage Location
- Settings: Stored in localStorage (per-app)
- Downloads: System default downloads folder (can be changed per download)

### Developer Mode
Press `F12` to open Chrome DevTools for debugging and inspection.

## 🆘 Support

For issues or questions:
- **GitHub Issues:** https://github.com/Ansh200618/SnapStream/issues
- **Discussions:** https://github.com/Ansh200618/SnapStream/discussions
- **Documentation:** See README.md in this folder

## 🎉 Next Steps

1. Try navigating to an image-heavy website
2. Open the SnapStream panel
3. Experiment with filters
4. Download some images!

**Popular test sites:**
- Unsplash.com (free high-quality images)
- Pexels.com (stock photos)
- Any Pinterest board
- Any e-commerce site

---

**Enjoy using SnapStream Desktop! 🚀**
