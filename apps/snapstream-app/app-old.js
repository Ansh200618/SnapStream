// Main App Script - Combines browser navigation with SnapStream UI
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

let webview;
let adBlockerEnabled = true;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    webview = document.getElementById('webview');
    
    // Set up event listeners
    setupNavigationControls();
    setupWebviewEvents();
    setupAdBlocker();
    setupSnapStreamPanel();
    
    updateStatus('Ready');
}

// Navigation Controls
function setupNavigationControls() {
    const backBtn = document.getElementById('back-btn');
    const forwardBtn = document.getElementById('forward-btn');
    const reloadBtn = document.getElementById('reload-btn');
    const urlInput = document.getElementById('url-input');
    const goBtn = document.getElementById('go-btn');
    
    backBtn.addEventListener('click', () => {
        if (webview.canGoBack()) {
            webview.goBack();
        }
    });
    
    forwardBtn.addEventListener('click', () => {
        if (webview.canGoForward()) {
            webview.goForward();
        }
    });
    
    reloadBtn.addEventListener('click', () => {
        webview.reload();
    });
    
    goBtn.addEventListener('click', () => {
        navigateToUrl(urlInput.value);
    });
    
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            navigateToUrl(urlInput.value);
        }
    });
}

function navigateToUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
        } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
    }
    
    webview.src = url;
    updateStatus('Loading...');
}

// Webview Events
function setupWebviewEvents() {
    webview.addEventListener('did-start-loading', () => {
        updateStatus('Loading...');
    });
    
    webview.addEventListener('did-stop-loading', () => {
        updateStatus('Page loaded');
        const url = webview.getURL();
        document.getElementById('url-input').value = url;
    });
    
    webview.addEventListener('did-fail-load', (event) => {
        if (event.errorCode !== -3) {
            updateStatus('Failed to load page');
        }
    });
    
    webview.addEventListener('new-window', (event) => {
        event.preventDefault();
        webview.src = event.url;
    });
}

// Ad Blocker Controls
function setupAdBlocker() {
    const adBlockerBtn = document.getElementById('adblocker-btn');
    
    updateAdBlockerStatus();
    
    adBlockerBtn.addEventListener('click', async () => {
        adBlockerEnabled = !adBlockerEnabled;
        const result = await window.electronAPI.toggleAdBlocker(adBlockerEnabled);
        
        if (result.success) {
            updateAdBlockerButton();
            updateStatus(adBlockerEnabled ? 'Ad blocker enabled' : 'Ad blocker disabled');
            webview.reload();
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

// SnapStream Panel Controls
function setupSnapStreamPanel() {
    const showImagesBtn = document.getElementById('show-images-btn');
    const closePanelBtn = document.getElementById('close-panel-btn');
    
    showImagesBtn.addEventListener('click', () => {
        toggleSnapStreamPanel(true);
        // Initialize SnapStream UI
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

// Initialize SnapStream UI (React-based from original extension)
function initializeSnapStreamUI() {
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
                // Execute script in webview to extract images
                const result = await webview.executeJavaScript(`
                    (function() {
                        const images = [];
                        const linkedImages = [];
                        
                        // Get images from img tags
                        document.querySelectorAll('img').forEach(img => {
                            if (img.src && (img.src.startsWith('http') || img.src.startsWith('data:'))) {
                                images.push(img.src);
                            }
                            
                            // Check srcset
                            if (img.srcset) {
                                const srcsetUrls = img.srcset.split(',').map(s => s.trim().split(' ')[0]);
                                srcsetUrls.forEach(url => {
                                    if (url.startsWith('http')) {
                                        images.push(url);
                                    }
                                });
                            }
                        });
                        
                        // Get background images from CSS
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
                        
                        // Get linked images
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

                        if (!image) return true; // Include if not yet loaded

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
                // Note: Actual download implementation would go here
                console.log(`Would download ${imagesToDownload.length} images to ${result.directory}`);
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
                        <img class="toggle" src="../../images/times.svg" />
                    </button>

                    <button
                        id="refresh_images_button"
                        title="Refresh images"
                        disabled=${isLoadingImages}
                        onClick=${refreshImages}
                    >
                        <img src="../../images/refresh.svg" />
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

    // Render the SnapStream UI
    render(html`<${Popup} />`, document.querySelector('main'));
}

// Utility Functions
function updateStatus(text) {
    document.getElementById('status-text').textContent = text;
}

// Handle new tab from menu
if (window.electronAPI) {
    window.electronAPI.onNewTab(() => {
        document.getElementById('url-input').value = 'https://www.google.com';
        webview.src = 'https://www.google.com';
    });
}
