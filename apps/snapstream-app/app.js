// Enhanced Browser App with Full Features - Main focus on Image Downloader
import html, {
  render,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from './lib/htm.js';
import { useDebouncedCallback } from './src/hooks/useDebouncedCallback.js';
import { useRunAfterUpdate } from './src/hooks/useRunAfterUpdate.js';
import { isIncludedIn, removeSpecialCharacters, unique } from './src/utils.js';

import { AdvancedFilters } from './src/AdvancedFilters.js';
import { DownloadConfirmation } from './src/DownloadConfirmation.js';
import { Images } from './src/Images.js';
import { UrlFilterMode } from './src/UrlFilterMode.js';

// Global state
let tabs = [];
let currentTabIndex = 0;
let adBlockerEnabled = true;
let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
let history = JSON.parse(localStorage.getItem('history') || '[]');
let settings = JSON.parse(localStorage.getItem('settings') || JSON.stringify({
    homePage: 'https://www.google.com',
    autoDetectImages: true,
    showImageBadge: true
}));

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    console.log('Initializing SnapStream Browser...');
    
    // Initialize first tab
    createTab('https://www.google.com');
    
    // Set up event listeners
    setupNavigationControls();
    setupToolbarActions();
    setupAdBlocker();
    setupSnapStreamPanel();
    setupKeyboardShortcuts();
    setupSettings();
    
    updateStatus('Ready');
}

// Tab Management
function createTab(url = 'https://www.google.com') {
    const tabId = 'tab-' + Date.now();
    const tab = {
        id: tabId,
        url: url,
        title: 'New Tab',
        favicon: '🌐',
        webview: null
    };
    
    tabs.push(tab);
    currentTabIndex = tabs.length - 1;
    
    renderTabs();
    switchToTab(currentTabIndex);
}

function renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';
    
    tabs.forEach((tab, index) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab' + (index === currentTabIndex ? ' active' : '');
        tabEl.innerHTML = `
            <span class="tab-favicon">${tab.favicon}</span>
            <span class="tab-title">${tab.title}</span>
            <button class="tab-close" onclick="closeTab(${index})" title="Close tab">×</button>
        `;
        tabEl.onclick = (e) => {
            if (!e.target.classList.contains('tab-close')) {
                switchToTab(index);
            }
        };
        container.appendChild(tabEl);
    });
}

function switchToTab(index) {
    if (index < 0 || index >= tabs.length) return;
    
    currentTabIndex = index;
    const tab = tabs[index];
    
    // Hide all webviews
    const browserView = document.getElementById('browser-view');
    Array.from(browserView.querySelectorAll('webview')).forEach(wv => {
        wv.style.display = 'none';
    });
    
    // Show current webview or create it
    if (!tab.webview) {
        const webview = document.createElement('webview');
        webview.id = tab.id;
        webview.src = tab.url;
        webview.style.width = '100%';
        webview.style.height = '100%';
        webview.setAttribute('partition', 'persist:snapstream');
        webview.setAttribute('webpreferences', 'javascript=yes');
        webview.setAttribute('allowpopups', '');
        
        browserView.appendChild(webview);
        tab.webview = webview;
        
        setupWebviewEvents(webview, index);
    } else {
        tab.webview.style.display = 'block';
    }
    
    // Update URL bar
    document.getElementById('url-input').value = tab.url;
    
    // Update navigation buttons
    updateNavigationButtons();
    
    renderTabs();
}

window.closeTab = function(index) {
    if (tabs.length === 1) {
        // Don't close last tab, just navigate to home
        tabs[0].url = settings.homePage;
        if (tabs[0].webview) {
            tabs[0].webview.src = settings.homePage;
        }
        return;
    }
    
    // Remove webview
    if (tabs[index].webview) {
        tabs[index].webview.remove();
    }
    
    tabs.splice(index, 1);
    
    // Adjust current tab index
    if (currentTabIndex >= tabs.length) {
        currentTabIndex = tabs.length - 1;
    }
    
    renderTabs();
    switchToTab(currentTabIndex);
};

// Navigation Controls
function setupNavigationControls() {
    const backBtn = document.getElementById('back-btn');
    const forwardBtn = document.getElementById('forward-btn');
    const reloadBtn = document.getElementById('reload-btn');
    const homeBtn = document.getElementById('home-btn');
    const urlInput = document.getElementById('url-input');
    const newTabBtn = document.getElementById('new-tab-btn');
    
    backBtn.addEventListener('click', () => {
        const webview = getCurrentWebview();
        if (webview && webview.canGoBack()) {
            webview.goBack();
        }
    });
    
    forwardBtn.addEventListener('click', () => {
        const webview = getCurrentWebview();
        if (webview && webview.canGoForward()) {
            webview.goForward();
        }
    });
    
    reloadBtn.addEventListener('click', () => {
        const webview = getCurrentWebview();
        if (webview) {
            webview.reload();
        }
    });
    
    homeBtn.addEventListener('click', () => {
        navigateToUrl(settings.homePage);
    });
    
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            navigateToUrl(urlInput.value);
        }
    });
    
    urlInput.addEventListener('focus', () => {
        urlInput.select();
    });
    
    newTabBtn.addEventListener('click', () => {
        createTab(settings.homePage);
    });
}

function getCurrentWebview() {
    return tabs[currentTabIndex]?.webview;
}

function navigateToUrl(url) {
    if (!url) return;
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
        } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
    }
    
    const webview = getCurrentWebview();
    if (webview) {
        webview.src = url;
        tabs[currentTabIndex].url = url;
    }
    
    updateStatus('Loading...');
}

function updateNavigationButtons() {
    const webview = getCurrentWebview();
    const backBtn = document.getElementById('back-btn');
    const forwardBtn = document.getElementById('forward-btn');
    
    if (webview) {
        backBtn.disabled = !webview.canGoBack();
        forwardBtn.disabled = !webview.canGoForward();
    } else {
        backBtn.disabled = true;
        forwardBtn.disabled = true;
    }
}

// Webview Events
function setupWebviewEvents(webview, tabIndex) {
    webview.addEventListener('did-start-loading', () => {
        if (tabIndex === currentTabIndex) {
            updateStatus('Loading...');
        }
    });
    
    webview.addEventListener('did-stop-loading', () => {
        const url = webview.getURL();
        tabs[tabIndex].url = url;
        
        if (tabIndex === currentTabIndex) {
            updateStatus('Page loaded');
            document.getElementById('url-input').value = url;
            updateNavigationButtons();
        }
        
        // Add to history
        addToHistory(url, tabs[tabIndex].title);
        
        // Auto-detect images if enabled
        if (settings.autoDetectImages) {
            autoDetectImages(webview);
        }
    });
    
    webview.addEventListener('page-title-updated', (event) => {
        tabs[tabIndex].title = event.title || 'Untitled';
        tabs[tabIndex].favicon = '🌐';
        renderTabs();
    });
    
    webview.addEventListener('did-fail-load', (event) => {
        if (event.errorCode !== -3 && tabIndex === currentTabIndex) {
            updateStatus('Failed to load page');
        }
    });
    
    webview.addEventListener('new-window', (event) => {
        event.preventDefault();
        createTab(event.url);
    });
}

// Toolbar Actions
function setupToolbarActions() {
    const bookmarkBtn = document.getElementById('bookmark-btn');
    const bookmarksBtn = document.getElementById('bookmarks-btn');
    const historyBtn = document.getElementById('history-btn');
    const downloadsBtn = document.getElementById('downloads-btn');
    const settingsBtn = document.getElementById('settings-btn');
    
    bookmarkBtn.addEventListener('click', toggleBookmark);
    bookmarksBtn.addEventListener('click', () => togglePanel('bookmarks-panel'));
    historyBtn.addEventListener('click', () => togglePanel('history-panel'));
    downloadsBtn.addEventListener('click', () => togglePanel('downloads-panel'));
    settingsBtn.addEventListener('click', () => togglePanel('settings-panel'));
    
    // Check if current page is bookmarked
    setInterval(() => {
        const currentUrl = tabs[currentTabIndex]?.url;
        const isBookmarked = bookmarks.some(b => b.url === currentUrl);
        bookmarkBtn.classList.toggle('bookmarked', isBookmarked);
    }, 500);
}

function toggleBookmark() {
    const tab = tabs[currentTabIndex];
    if (!tab) return;
    
    const existingIndex = bookmarks.findIndex(b => b.url === tab.url);
    
    if (existingIndex >= 0) {
        // Remove bookmark
        bookmarks.splice(existingIndex, 1);
        updateStatus('Bookmark removed');
    } else {
        // Add bookmark
        bookmarks.push({
            url: tab.url,
            title: tab.title,
            favicon: tab.favicon,
            date: new Date().toISOString()
        });
        updateStatus('Bookmark added');
    }
    
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    renderBookmarks();
}

function renderBookmarks() {
    const container = document.getElementById('bookmarks-content');
    
    if (bookmarks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <p>No bookmarks yet</p>
                <p style="font-size: 12px; color: #666;">Press Ctrl+D to bookmark current page</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = bookmarks.map((bookmark, index) => `
        <div class="bookmark-item" onclick="navigateToUrl('${bookmark.url}')">
            <div class="item-title">${bookmark.favicon} ${bookmark.title}</div>
            <div class="item-url">${bookmark.url}</div>
            <button style="float: right; margin-top: -30px; padding: 4px 8px; background: rgba(255,0,0,0.3); border: none; border-radius: 4px; color: white; cursor: pointer;" onclick="event.stopPropagation(); removeBookmark(${index})">Delete</button>
        </div>
    `).join('');
}

window.removeBookmark = function(index) {
    bookmarks.splice(index, 1);
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    renderBookmarks();
};

function addToHistory(url, title) {
    // Don't add duplicate recent entries
    const recentIndex = history.findIndex((h, i) => i < 10 && h.url === url);
    if (recentIndex >= 0) {
        history.splice(recentIndex, 1);
    }
    
    history.unshift({
        url: url,
        title: title || 'Untitled',
        date: new Date().toISOString()
    });
    
    // Keep only last 100 entries
    if (history.length > 100) {
        history = history.slice(0, 100);
    }
    
    localStorage.setItem('history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('history-content');
    
    if (history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🕐</div>
                <p>No history yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = history.map(item => `
        <div class="history-item" onclick="navigateToUrl('${item.url}')">
            <div class="item-title">${item.title}</div>
            <div class="item-url">${item.url}</div>
            <div class="item-time">${new Date(item.date).toLocaleString()}</div>
        </div>
    `).join('');
}

function togglePanel(panelId) {
    // Close all panels first
    document.querySelectorAll('.side-panel').forEach(panel => {
        panel.classList.remove('open');
    });
    
    // Close SnapStream panel if open
    document.getElementById('snapstream-panel').classList.add('hidden');
    
    // Open requested panel
    const panel = document.getElementById(panelId);
    panel.classList.add('open');
    
    // Render content
    if (panelId === 'bookmarks-panel') renderBookmarks();
    if (panelId === 'history-panel') renderHistory();
}

window.closePanel = function(panelId) {
    document.getElementById(panelId).classList.remove('open');
};

// Ad Blocker
function setupAdBlocker() {
    const adBlockerBtn = document.getElementById('adblocker-btn');
    
    updateAdBlockerStatus();
    
    adBlockerBtn.addEventListener('click', async () => {
        adBlockerEnabled = !adBlockerEnabled;
        const result = await window.electronAPI.toggleAdBlocker(adBlockerEnabled);
        
        if (result.success) {
            updateAdBlockerButton();
            updateStatus(adBlockerEnabled ? 'Ad blocker enabled' : 'Ad blocker disabled');
            // Reload current tab
            const webview = getCurrentWebview();
            if (webview) webview.reload();
        } else {
            updateStatus('Failed to toggle ad blocker');
        }
    });
}

async function updateAdBlockerStatus() {
    try {
        const status = await window.electronAPI.getAdBlockerStatus();
        adBlockerEnabled = status.enabled;
        updateAdBlockerButton();
    } catch (error) {
        console.error('Error getting ad blocker status:', error);
    }
}

function updateAdBlockerButton() {
    const adBlockerBtn = document.getElementById('adblocker-btn');
    if (adBlockerEnabled) {
        adBlockerBtn.classList.add('active');
        adBlockerBtn.classList.remove('disabled');
        adBlockerBtn.title = 'Ad Blocker (Enabled)';
    } else {
        adBlockerBtn.classList.remove('active');
        adBlockerBtn.classList.add('disabled');
        adBlockerBtn.title = 'Ad Blocker (Disabled)';
    }
}

// SnapStream Panel
function setupSnapStreamPanel() {
    const showImagesBtn = document.getElementById('show-images-btn');
    const closePanelBtn = document.getElementById('close-panel-btn');
    
    showImagesBtn.addEventListener('click', () => {
        // Close side panels
        document.querySelectorAll('.side-panel').forEach(panel => {
            panel.classList.remove('open');
        });
        
        toggleSnapStreamPanel(true);
        initializeSnapStreamUI();
    });
    
    closePanelBtn.addEventListener('click', () => {
        toggleSnapStreamPanel(false);
    });
}

function toggleSnapStreamPanel(show) {
    const panel = document.getElementById('snapstream-panel');
    if (show) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

function autoDetectImages(webview) {
    if (!settings.autoDetectImages) return;
    
    setTimeout(async () => {
        try {
            const result = await webview.executeJavaScript(`
                (function() {
                    const images = document.querySelectorAll('img');
                    return images.length;
                })();
            `);
            
            if (result > 0 && settings.showImageBadge) {
                const btn = document.getElementById('show-images-btn');
                // Could add a badge here
                console.log(`Found ${result} images on page`);
            }
        } catch (error) {
            console.error('Error detecting images:', error);
        }
    }, 2000);
}

// Initialize SnapStream UI (React-based from original extension)
function initializeSnapStreamUI() {
    const webview = getCurrentWebview();
    if (!webview) {
        updateStatus('No active tab');
        return;
    }
    
    const initialOptions = localStorage;

    const Popup = () => {
        const [options, setOptions] = useState(initialOptions);

        useEffect(() => {
            Object.assign(localStorage, options);
        }, [options]);

        const [allImages, setAllImages] = useState([]);
        const [linkedImages, setLinkedImages] = useState([]);
        const [selectedImages, setSelectedImages] = useState([]);
        const [visibleImages, setVisibleImages] = useState([]);
        const [isLoadingImages, setIsLoadingImages] = useState(false);

        const loadImages = useCallback(async () => {
            setIsLoadingImages(true);
            updateStatus('Detecting images...');
            
            try {
                const result = await webview.executeJavaScript(`
                    (function() {
                        const images = [];
                        const linkedImages = [];
                        
                        document.querySelectorAll('img').forEach(img => {
                            if (img.src && (img.src.startsWith('http') || img.src.startsWith('data:'))) {
                                images.push(img.src);
                            }
                            
                            if (img.srcset) {
                                const srcsetUrls = img.srcset.split(',').map(s => s.trim().split(' ')[0]);
                                srcsetUrls.forEach(url => {
                                    if (url.startsWith('http')) {
                                        images.push(url);
                                    }
                                });
                            }
                        });
                        
                        document.querySelectorAll('*').forEach(el => {
                            const style = window.getComputedStyle(el);
                            const bgImage = style.backgroundImage;
                            if (bgImage && bgImage !== 'none') {
                                const matches = bgImage.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/g);
                                if (matches) {
                                    matches.forEach(match => {
                                        const url = match.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/)[1];
                                        if (url.startsWith('http')) {
                                            images.push(url);
                                        }
                                    });
                                }
                            }
                        });
                        
                        document.querySelectorAll('a').forEach(link => {
                            const href = link.href;
                            if (href && /\\.(jpg|jpeg|png|gif|webp|bmp|svg)($|\\?)/i.test(href)) {
                                linkedImages.push(href);
                            }
                        });
                        
                        return {
                            allImages: [...new Set(images)],
                            linkedImages: [...new Set(linkedImages)],
                            origin: window.location.origin
                        };
                    })();
                `);
                
                setAllImages(result.allImages);
                setLinkedImages(result.linkedImages);
                localStorage.active_tab_origin = result.origin;
                setIsLoadingImages(false);
                updateStatus(`Found ${result.allImages.length} images`);
                
            } catch (error) {
                console.error('Error detecting images:', error);
                updateStatus('Error detecting images');
                setAllImages([]);
                setLinkedImages([]);
                setIsLoadingImages(false);
            }
        }, []);

        const refreshImages = useCallback(() => {
            setAllImages([]);
            setLinkedImages([]);
            setSelectedImages([]);
            loadImages();
        }, [loadImages]);

        useEffect(() => {
            loadImages();
        }, []);

        const imagesCacheRef = useRef(null);
        const filterImages = useDebouncedCallback(
            100,
            () => {
                let visibleImages =
                    options.only_images_from_links === 'true' ? linkedImages : allImages;

                let filterValue = options.filter_url;
                if (filterValue) {
                    switch (options.filter_url_mode) {
                        case 'normal':
                            const terms = filterValue.split(/\\s+/);
                            visibleImages = visibleImages.filter((url) => {
                                for (let index = 0; index < terms.length; index++) {
                                    let term = terms[index];
                                    if (term.length !== 0) {
                                        const expected = term[0] !== '-';
                                        if (!expected) {
                                            term = term.substr(1);
                                            if (term.length === 0) {
                                                continue;
                                            }
                                        }
                                        const found = url.indexOf(term) !== -1;
                                        if (found !== expected) {
                                            return false;
                                        }
                                    }
                                }
                                return true;
                            });
                            break;
                        case 'wildcard':
                            filterValue = filterValue
                                .replace(/([.^$[\\]\\\\(){}|-])/g, '\\\\$1')
                                .replace(/([?*+])/, '.$1');
                        /* fall through */
                        case 'regex':
                            visibleImages = visibleImages.filter((url) => {
                                try {
                                    return url.match(filterValue);
                                } catch (error) {
                                    return false;
                                }
                            });
                            break;
                    }
                }

                if (imagesCacheRef.current) {
                    visibleImages = visibleImages.filter((url) => {
                        const image = imagesCacheRef.current.querySelector(
                            `img[src="${encodeURI(url)}"]`
                        );

                        if (!image) return true;

                        return (
                            (options.filter_min_width_enabled !== 'true' ||
                                options.filter_min_width <= image.naturalWidth) &&
                            (options.filter_max_width_enabled !== 'true' ||
                                image.naturalWidth <= options.filter_max_width) &&
                            (options.filter_min_height_enabled !== 'true' ||
                                options.filter_min_height <= image.naturalHeight) &&
                            (options.filter_max_height_enabled !== 'true' ||
                                image.naturalHeight <= options.filter_max_height)
                        );
                    });
                }

                setVisibleImages(visibleImages);
            },
            [allImages, linkedImages, options]
        );

        useEffect(filterImages, [filterImages]);

        const [downloadIsInProgress, setDownloadIsInProgress] = useState(false);
        const imagesToDownload = useMemo(
            () => visibleImages.filter(isIncludedIn(selectedImages)),
            [visibleImages, selectedImages]
        );

        const [
            downloadConfirmationIsShown,
            setDownloadConfirmationIsShown,
        ] = useState(false);

        function downloadImages() {
            if (options.show_download_confirmation === 'true') {
                setDownloadConfirmationIsShown(true);
            } else {
                startDownload();
            }
        }

        async function startDownload() {
            setDownloadIsInProgress(true);
            currentImageNumberRef.current = 1;

            const result = await window.electronAPI.downloadImages(imagesToDownload);
            
            if (result.success && result.directory) {
                updateStatus(`Downloading ${imagesToDownload.length} images...`);
            }

            setDownloadIsInProgress(false);
        }

        const currentImageNumberRef = useRef(1);
        const runAfterUpdate = useRunAfterUpdate();

        return html`
            <div id="filters_container">
                <div style=${{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                        type="text"
                        placeholder="Filter by URL"
                        title="Filter by parts of the URL or regular expressions."
                        value=${options.filter_url || ''}
                        style=${{ flex: '1' }}
                        onChange=${({ currentTarget: { value } }) => {
                            setOptions((options) => ({ ...options, filter_url: value.trim() }));
                        }}
                    />

                    <${UrlFilterMode}
                        value=${options.filter_url_mode}
                        onChange=${({ currentTarget: { value } }) => {
                            setOptions((options) => ({ ...options, filter_url_mode: value }));
                        }}
                    />

                    <button
                        id="toggle_advanced_filters_button"
                        class=${options.show_advanced_filters === 'true' ? '' : 'collapsed'}
                        title="Toggle advanced filters"
                        onClick=${() => {
                            setOptions((options) => ({
                                ...options,
                                show_advanced_filters:
                                    options.show_advanced_filters === 'true' ? 'false' : 'true',
                            }));
                        }}
                    >
                        <img class="toggle" src="images/times.svg" />
                    </button>

                    <button
                        id="refresh_images_button"
                        title="Refresh images"
                        disabled=${isLoadingImages}
                        onClick=${refreshImages}
                    >
                        <img src="images/refresh.svg" />
                    </button>
                </div>

                ${options.show_advanced_filters === 'true'
                    ? html`<${AdvancedFilters}
                          options=${options}
                          setOptions=${setOptions}
                          allImages=${allImages}
                          linkedImages=${linkedImages}
                          runAfterUpdate=${runAfterUpdate}
                      />`
                    : null}
            </div>

            <${Images}
                options=${options}
                visibleImages=${visibleImages}
                selectedImages=${selectedImages}
                imagesToDownload=${imagesToDownload}
                setSelectedImages=${setSelectedImages}
                ref=${imagesCacheRef}
            />

            <div id="downloads_container">
                <button
                    style=${{ width: '100%' }}
                    disabled=${imagesToDownload.length === 0 || downloadIsInProgress}
                    onClick=${downloadImages}
                >
                    ${downloadIsInProgress
                        ? `Downloading (${currentImageNumberRef.current} / ${imagesToDownload.length})...`
                        : `Download (${imagesToDownload.length})`}
                </button>
            </div>

            ${downloadConfirmationIsShown
                ? html`<${DownloadConfirmation}
                      imagesToDownload=${imagesToDownload}
                      onConfirm=${() => {
                          setDownloadConfirmationIsShown(false);
                          startDownload();
                      }}
                      onCancel=${() => {
                          setDownloadConfirmationIsShown(false);
                      }}
                  />`
                : null}
        `;
    };

    render(html`<${Popup} />`, document.querySelector('main'));
}

// Settings
function setupSettings() {
    const homePageInput = document.getElementById('home-page-input');
    const autoDetectCheckbox = document.getElementById('auto-detect-images');
    const showBadgeCheckbox = document.getElementById('show-image-badge');
    
    homePageInput.value = settings.homePage;
    autoDetectCheckbox.checked = settings.autoDetectImages;
    showBadgeCheckbox.checked = settings.showImageBadge;
    
    homePageInput.addEventListener('change', () => {
        settings.homePage = homePageInput.value;
        localStorage.setItem('settings', JSON.stringify(settings));
    });
    
    autoDetectCheckbox.addEventListener('change', () => {
        settings.autoDetectImages = autoDetectCheckbox.checked;
        localStorage.setItem('settings', JSON.stringify(settings));
    });
    
    showBadgeCheckbox.addEventListener('change', () => {
        settings.showImageBadge = showBadgeCheckbox.checked;
        localStorage.setItem('settings', JSON.stringify(settings));
    });
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + T: New tab
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            createTab(settings.homePage);
        }
        
        // Ctrl/Cmd + W: Close tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            window.closeTab(currentTabIndex);
        }
        
        // Ctrl/Cmd + Tab: Next tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
            e.preventDefault();
            const nextIndex = (currentTabIndex + 1) % tabs.length;
            switchToTab(nextIndex);
        }
        
        // Ctrl/Cmd + D: Bookmark
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            toggleBookmark();
        }
        
        // Ctrl/Cmd + H: History
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
            e.preventDefault();
            togglePanel('history-panel');
        }
        
        // Ctrl/Cmd + Shift + B: Bookmarks
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
            e.preventDefault();
            togglePanel('bookmarks-panel');
        }
        
        // Ctrl/Cmd + L: Focus URL bar
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            document.getElementById('url-input').focus();
        }
    });
}

// Utility Functions
function updateStatus(text) {
    document.getElementById('status-text').textContent = text;
}

// Handle new tab from menu
if (window.electronAPI) {
    window.electronAPI.onNewTab(() => {
        createTab(settings.homePage);
    });
}
