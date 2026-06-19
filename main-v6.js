const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^192\.168\./)
);

// PWA: Register Service Worker
if ('serviceWorker' in navigator && !isLocalhost) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('Service Worker Registered');
        }).catch(err => {
            console.error('Service Worker registration failed:', err);
        });
    });
} else if ('serviceWorker' in navigator && isLocalhost) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
            registration.unregister().then(success => {
                if (success) console.log('ServiceWorker unregistered for local testing');
            });
        }
    });
}

const APP_VERSION = '7.12';
if (localStorage.getItem('hr_version') !== APP_VERSION) {
    localStorage.setItem('hr_version', APP_VERSION);
    if ('caches' in window) {
        caches.keys().then(names => {
            return Promise.all(names.map(name => caches.delete(name)));
        }).then(() => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    for (let registration of registrations) {
                        registration.update();
                    }
                });
            }
            window.location.reload();
        });
    } else {
        window.location.reload();
    }
}

// Global Variables
let drips = [];
const isMobile = window.innerWidth <= 768;
const dripCount = isMobile ? 12 : 40;

// Canvas Initialization
function initCanvas() {
    const canvas = document.getElementById('hr-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let resizeTimeout;
    function resize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }, 150);
    }

    window.addEventListener('resize', resize);
    resize();

    // Precomputed gradient cache for drip tails
    const gradientCache = new Map();

    class Drip {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = -Math.random() * 500;
            this.speed = Math.random() * 1.5 + 0.5;
            this.size = Math.random() * 4 + 2;
            this.length = Math.random() * 150 + 50;
            this.opacity = Math.random() * 0.6 + 0.2;
        }
        _getGradient() {
            const key = this.opacity.toFixed(3);
            if (!gradientCache.has(key)) {
                const g = document.createElement('canvas').getContext('2d').createLinearGradient(0, 0, 0, 1);
                g.addColorStop(0, 'transparent');
                g.addColorStop(1, 'rgba(139, 0, 0, ' + key + ')');
                gradientCache.set(key, g);
            }
            return gradientCache.get(key);
        }
        update() {
            this.y += this.speed;
            if (this.y > canvas.height + this.length) this.reset();
        }
        draw() {
            ctx.fillStyle = 'rgba(139, 0, 0, ' + this.opacity + ')';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            const grad = this._getGradient();
            ctx.save();
            ctx.translate(this.x - this.size / 2, this.y - this.length);
            ctx.scale(1, this.length);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.size, 1);
            ctx.restore();
        }
    }

    function initDrips() {
        for (let i = 0; i < dripCount; i++) drips.push(new Drip());
    }

    let lastFrameTime = 0;
    var FRAME_INTERVAL = 67; // ~15fps for background effect
    function animate(timestamp) {
        if (document.hidden) {
            lastFrameTime = timestamp;
            requestAnimationFrame(animate);
            return;
        }
        if (timestamp - lastFrameTime < FRAME_INTERVAL) {
            requestAnimationFrame(animate);
            return;
        }
        lastFrameTime = timestamp;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drips.forEach(function (d) { d.update(); d.draw(); });
        requestAnimationFrame(animate);
    }

    initDrips();
    animate();
}

function injectFooter() {
    if (document.querySelector('.ytm-shell')) return;
    var footer = document.createElement('footer');
    footer.className = 'hr-footer';
    footer.innerHTML = '\n        <div class="hr-container">\n            <p>&copy; 2026 Horrorcore Reshare. <a href="privacy.html" style="color: var(--hr-text-muted); text-decoration: none; margin-left: 15px; font-size: 0.8rem;">Privacy</a></p>\n        </div>\n    ';
    document.body.appendChild(footer);
}

// INJECT ARTIST CARDS
function injectArtists() {
    var grid = document.getElementById('artist-grid');
    if (!grid) return;
    if (typeof artistData === 'undefined') return;
    grid.innerHTML = '';

    artistData.forEach(function (artist) {
        var frameImg = artist.img || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + artist.name + '&backgroundColor=050505&shape1Color=8b0000';
        var card = document.createElement('div');
        card.className = 'ytm-artist-card';
        card.onclick = function () {
            if (artist.externalUrl) {
                window.location.href = artist.externalUrl;
            } else {
                window.location.href = (isLocalhost ? 'artist.html' : '/artist') + '?name=' + encodeURIComponent(artist.name);
            }
        };
        var releasesCount = artist.releases ? artist.releases.length : 0;
        var releasesText = releasesCount + ' RELEASE' + (releasesCount !== 1 ? 'S' : '');
        var description = artist.description || '';
        var shortDesc = description.length > 130 ? description.substring(0, 127).trim() + '...' : description;

        var socialLinks = [];
        if (artist.spotify) {
            socialLinks.push('<a href="' + artist.spotify + '" target="_blank" rel="noopener noreferrer" class="art-card-social-link spotify" title="Spotify" onclick="event.stopPropagation()" aria-label="' + artist.name + ' Spotify"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.893-.982-.336.075-.668-.135-.744-.47-.077-.337.135-.668.47-.743 3.856-.88 7.15-.502 9.822 1.13.295.178.387.563.207.858zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.847-.107-.972-.52-.125-.413.108-.847.52-.972 3.67-1.114 8.24-.57 11.346 1.34.367.226.488.707.26 1.074zm.107-2.846C14.34 8.752 8.44 8.557 5.006 9.6c-.53.16-1.09-.14-1.25-.67-.16-.53.14-1.09.67-1.25 3.943-1.196 10.457-.97 14.464 1.407.476.28.63.9.35 1.376-.28.477-.9.63-1.376.35z"/></svg></a>');
        }
        if (artist.instagram) {
            socialLinks.push('<a href="' + artist.instagram + '" target="_blank" rel="noopener noreferrer" class="art-card-social-link instagram" title="Instagram" onclick="event.stopPropagation()" aria-label="' + artist.name + ' Instagram"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>');
        }
        if (artist.website) {
            socialLinks.push('<a href="' + artist.website + '" target="_blank" rel="noopener noreferrer" class="art-card-social-link website" title="Website" onclick="event.stopPropagation()" aria-label="' + artist.name + ' Website"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg></a>');
        }
        if (artist.youtube) {
            socialLinks.push('<a href="' + artist.youtube + '" target="_blank" rel="noopener noreferrer" class="art-card-social-link youtube" title="YouTube" onclick="event.stopPropagation()" aria-label="' + artist.name + ' YouTube"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>');
        }

        card.innerHTML = '\n            <div class="ytm-artist-avatar">\n                <img src="' + frameImg + '" alt="' + artist.name + '" loading="lazy" onload="this.classList.add(\'loaded\')" onerror="this.src=\'https://api.dicebear.com/7.x/shapes/svg?seed=' + artist.name + '&backgroundColor=050505&shape1Color=8b0000\'">\n            </div>\n            <div class="ytm-artist-card-name">' + artist.name + '</div>\n            <div class="ytm-artist-card-releases">' + releasesText + '</div>\n            ' + (shortDesc ? '<div class="ytm-artist-card-desc">' + shortDesc + '</div>' : '') + '\n            ' + (socialLinks.length > 0 ? '<div class="ytm-artist-card-links">' + socialLinks.join('') + '</div>' : '') + '\n        ';
        grid.appendChild(card);
    });
}

// Header Injection Logic
function injectHeader() {
    if (document.querySelector('.hr-header')) return;
    var header = document.createElement('header');
    header.className = 'hr-header';
    header.innerHTML = '\n        <div class="hr-logo"><a href="' + (isLocalhost ? 'index.html' : '/') + '"><img src="https://raw.githubusercontent.com/Moonfire-dreamwalkers/horrorcore-reshare-public-assets/main/images/hr-icon.png" alt="Horrorcore Reshare"></a></div>\n        <nav class="hr-nav">\n            <a href="' + (isLocalhost ? 'index.html' : '/') + '">Home</a>\n            <a href="' + (isLocalhost ? 'artists.html' : '/artists') + '">Artists</a>\n            <a href="' + (isLocalhost ? 'promote.html' : '/promote') + '">Promote</a>\n            <a href="' + (isLocalhost ? 'flyer-builder.html' : '/flyer-builder') + '">Flyer Builder</a>\n            <a href="' + (isLocalhost ? 'discord.html' : '/discord') + '">Discord</a>\n            <a href="' + (isLocalhost ? 'services.html' : '/services') + '">Services</a>\n<a href="#" onclick="return false" style="cursor: default;" id="nav-build-version">UPDATE</a>\n        </nav>\n    ';

    var main = document.querySelector('main');
    if (main) {
        main.parentNode.insertBefore(header, main);
    } else {
        document.body.prepend(header);
    }
}

// MASTER AUDIO PLAYER DECK CONTROLLER
var MasterAudioPlayer = (function () {
    function MasterAudioPlayer() {
        this.playlist = [];
        this.currentIndex = -1;
        this.audio = null;
        this.isPlaying = false;
        this.volume = parseFloat(localStorage.getItem('hr_player_volume') || '0.8');
        this.dom = {};
        this.activeAlbumId = '';
        this.playerMode = 'preview';
        this.allReleases = [];
        this.repeatMode = localStorage.getItem('hr_player_repeat') === 'true';
        this._loadingAlbumId = null;
        this._pendingAlbumLoad = null;
        this._lastClickTime = 0;
        this._progressRafId = null;
    }

    MasterAudioPlayer.prototype.init = function () {
        this.dom.progressBar = document.getElementById('player-progress-bar');
        this.dom.timeCurrent = document.getElementById('player-time-current');
        this.dom.timeTotal = document.getElementById('player-time-total');
        this.dom.volumeSlider = document.getElementById('player-volume-slider');
        this.dom.prevBtn = document.getElementById('player-prev-btn');
        this.dom.playBtn = document.getElementById('player-play-btn');
        this.dom.nextBtn = document.getElementById('player-next-btn');

        this.dom.cover = document.getElementById('player-cover');
        this.dom.blurBg = document.getElementById('player-blur-bg');
        this.dom.bottomThumb = document.getElementById('bottom-active-thumb');
        this.dom.trackTitle = document.getElementById('player-track-title');
        this.dom.artist = document.getElementById('player-artist');
        this.dom.albumTitle = document.getElementById('player-album-title');

        this.dom.visualizerStatus = document.getElementById('visualizer-status');
        this.dom.visualizerBars = document.getElementById('visualizer-bars');

        this.dom.tabTracks = document.getElementById('player-tab-tracks');
        this.dom.tabLibrary = document.getElementById('player-tab-library');
        this.dom.lyricsContent = document.getElementById('player-lyrics-content');

        this.dom.btnTabTracks = document.getElementById('tab-btn-tracks');
        this.dom.btnTabLibrary = document.getElementById('tab-btn-library');

        this.dom.rowsContainer = document.getElementById('player-tracklist-rows');
        this.dom.releasesList = document.getElementById('player-releases-list');
        this.dom.artistSelect = document.getElementById('player-artist-select');
        this.dom.releaseSelect = document.getElementById('player-release-select');
        this.dom.prevReleaseBtn = document.getElementById('player-prev-release-btn');
        this.dom.nextReleaseBtn = document.getElementById('player-next-release-btn');

        this.dom.previewMode = document.getElementById('player-preview-mode');
        this.dom.spotifyMode = document.getElementById('player-spotify-mode');
        this.dom.spotifyIframe = document.getElementById('player-spotify-iframe');
        this.dom.btnModePreview = document.getElementById('player-mode-preview-btn');
        this.dom.btnModeSpotify = document.getElementById('player-mode-spotify-btn');

        // Cached elements for loadAlbum
        this._domCenterTitle = document.getElementById('center-album-title');
        this._domCenterArtist = document.getElementById('center-artist-name');
        this._domSpotifyBtn = document.getElementById('center-spotify-btn');
        this._domExtraLinks = document.getElementById('artist-extra-links');
        this._domCoreWidget = document.querySelector('.player-core-widget');
        this._domCoverContainer = document.querySelector('.player-core-widget .ytm-cover-container');

        if (this.dom.volumeSlider) {
            this.dom.volumeSlider.value = this.volume;
            this.updateVolumeSliderFill();
        }

        var repeatBtn = document.getElementById('player-repeat-btn');
        if (repeatBtn && this.repeatMode) {
            repeatBtn.classList.add('active');
        }

        this.compileAllReleases();
        this.initializeTickerStrip();
        this.initializeSelects();

        if (this.allReleases && this.allReleases.length > 0) {
            var defaultRelease = this.allReleases[0];
            if (this.dom.artistSelect && this.dom.artistSelect.value !== 'all') {
                var artistReleases = this.allReleases.filter(function (r) { return r.artist === this.dom.artistSelect.value; }.bind(this));
                if (artistReleases.length > 0) {
                    defaultRelease = artistReleases[0];
                }
            }
            this.loadAlbum(defaultRelease.id, 0, false);
        }

        var params = new URLSearchParams(window.location.search);
        var viewParam = params.get('view');
        if (viewParam) {
            var targetView = (viewParam === 'explore' || viewParam === 'library') ? 'home' : viewParam;
            this.switchView(targetView);
        } else {
            var hasProfile = document.getElementById('ytm-artist-profile-content');
            var hasLibrary = document.getElementById('ytm-library-view');
            if (hasProfile) {
                this.switchView('profile');
            } else if (hasLibrary) {
                this.switchView('library');
            } else {
                this.switchView('home');
            }
        }

        this.updateSidebarTabsVisibility();
        console.log("Global YTM Audio Player initialized.");
    };

    MasterAudioPlayer.prototype._startProgressLoop = function () {
        if (this._progressRafId) return;
        var self = this;
        var tick = function () {
            self.updateProgress();
            self._progressRafId = requestAnimationFrame(tick);
        };
        this._progressRafId = requestAnimationFrame(tick);
    };

    MasterAudioPlayer.prototype._stopProgressLoop = function () {
        if (this._progressRafId) {
            cancelAnimationFrame(this._progressRafId);
            this._progressRafId = null;
        }
    };

    Object.defineProperty(MasterAudioPlayer.prototype, '_artistMap', {
        get: function () {
            if (!this.__artistMap && typeof artistData !== 'undefined') {
                this.__artistMap = new Map();
                artistData.forEach(function (a) {
                    this.__artistMap.set(a.name.toLowerCase().trim(), a);
                    if (a.name.toLowerCase().trim() === 'something outta nothing') {
                        this.__artistMap.set('somethin outta nothin', a);
                    }
                }.bind(this));
            }
            return this.__artistMap || new Map();
        }
    });

    MasterAudioPlayer.prototype.compileAllReleases = function () {
        if (typeof albumData === 'undefined') return;

        var allowedArtists = new Set(
            (typeof artistData !== 'undefined' ? artistData : []).map(function (a) { return a.name.toLowerCase().trim(); })
        );
        allowedArtists.add("somethin outta nothin");

        var releases = Object.keys(albumData).map(function (id) {
            var obj = { id: id };
            var album = albumData[id];
            for (var k in album) { if (album.hasOwnProperty(k)) obj[k] = album[k]; }
            return obj;
        });

        releases = releases.filter(function (r) {
            var artistName = r.artist ? r.artist.toLowerCase().trim() : '';
            return allowedArtists.has(artistName);
        });

        releases.sort(function (a, b) {
            var yearA = a.releaseYear || '';
            var yearB = b.releaseYear || '';
            if (yearA !== yearB) return yearB.localeCompare(yearA);
            var dateA = a.releaseDate || '';
            var dateB = b.releaseDate || '';
            if (dateA && dateB) return dateB.localeCompare(dateA);
            if (dateA) return -1;
            if (dateB) return 1;
            return a.title.localeCompare(b.title);
        });

        releases = this._filterDuplicateSingles(releases);
        this.allReleases = releases;
    };

    MasterAudioPlayer.prototype._filterDuplicateSingles = function (releases) {
        var byArtist = {};
        releases.forEach(function (r) {
            var artist = r.artist || 'Unknown';
            if (!byArtist[artist]) byArtist[artist] = [];
            byArtist[artist].push(r);
        });

        var filtered = [];
        for (var artist in byArtist) {
            if (!byArtist.hasOwnProperty(artist)) continue;
            var artistReleases = byArtist[artist];
            var albumsEPs = artistReleases.filter(function (r) { return (r.tracksCount || 0) > 1; });
            var singles = artistReleases.filter(function (r) { return (r.tracksCount || 0) === 1; });
            var albumTrackTitles = new Set();
            albumsEPs.forEach(function (album) {
                if (album.tracks) {
                    album.tracks.forEach(function (track) {
                        if (track.title) albumTrackTitles.add(track.title.toLowerCase().trim());
                    });
                }
            });
            var filteredSingles = singles.filter(function (single) {
                if (!single.tracks || single.tracks.length === 0) return true;
                var trackTitle = single.tracks[0].title;
                if (!trackTitle) return true;
                return !albumTrackTitles.has(trackTitle.toLowerCase().trim());
            });
            filtered.push.apply(filtered, albumsEPs);
            filtered.push.apply(filtered, filteredSingles);
        }

        filtered.sort(function (a, b) {
            var yearA = a.releaseYear || '';
            var yearB = b.releaseYear || '';
            if (yearA !== yearB) return yearB.localeCompare(yearA);
            var dateA = a.releaseDate || '';
            var dateB = b.releaseDate || '';
            if (dateA && dateB) return dateB.localeCompare(dateA);
            if (dateA) return -1;
            if (dateB) return 1;
            return a.title.localeCompare(b.title);
        });

        return filtered;
    };

    MasterAudioPlayer.prototype._ensureDataReady = function (callback, retriesLeft) {
        retriesLeft = typeof retriesLeft === 'number' ? retriesLeft : 50;
        if (typeof albumData !== 'undefined' && typeof artistData !== 'undefined') {
            callback(true);
            return;
        }
        if (retriesLeft <= 0) {
            console.warn('_ensureDataReady: timed out waiting for albumData/artistData');
            callback(false);
            return;
        }
        var self = this;
        requestAnimationFrame(function () { self._ensureDataReady(callback, retriesLeft - 1); });
    };

    MasterAudioPlayer.prototype._flushPendingLoad = function () {
        if (this._pendingAlbumLoad) {
            var pending = this._pendingAlbumLoad;
            this._pendingAlbumLoad = null;
            this._loadingAlbumId = null;
            this.loadAlbum(pending.albumId, pending.trackIndex, pending.autoPlay);
        }
    };

    MasterAudioPlayer.prototype._setPlayBtnSvg = function (icon) {
        if (!this.dom.playBtn) return;
        var playSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        var pauseSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        this.dom.playBtn.innerHTML = icon === 'pause' ? pauseSvg : playSvg;
    };

    MasterAudioPlayer.prototype.initializeTickerStrip = function (releasesToUse) {
        var scrollContainer = document.querySelector('.player-header-title-scroll');
        if (!scrollContainer) return;
        var list = releasesToUse || this.allReleases;
        if (!list || list.length === 0) {
            var baseTitle = "HORRORCORE RESHARE RELEASE RADAR";
            scrollContainer.innerHTML = '<span>' + baseTitle + '</span><span>' + baseTitle + '</span>';
            scrollContainer.parentElement.style.removeProperty('--marquee-duration');
            return;
        }
        var tickerCount = Math.min(list.length, 10);
        var topReleases = list.slice(0, tickerCount);
        var releaseTexts = topReleases.map(function (r) {
            var displayDate = "";
            if (r.releaseDate) {
                try {
                    var dateObj = new Date(r.releaseDate);
                    if (!isNaN(dateObj.getTime())) {
                        var year = dateObj.getUTCFullYear();
                        var month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
                        var day = dateObj.getUTCDate();
                        displayDate = ' (' + month + ' ' + day + ', ' + year + ')';
                    }
                } catch (e) { }
            }
            return 'NOW STREAMING<span class="ticker-colon">:</span> ' + r.title.toUpperCase() + ' <span class="ticker-dash">-</span> ' + r.artist.toUpperCase() + '<span class="ticker-date">' + displayDate + '</span>';
        });

        var baseTitle = "HORRORCORE RESHARE";
        var titleTag = '<span class="ticker-title">' + baseTitle + '</span><span class="ticker-sep">&mdash;</span>';
        var entriesText = titleTag + releaseTexts.join(' <span class="ticker-dash">;</span> ' + titleTag) + ' <span class="ticker-dash">;</span> ' + titleTag;
        var copyHTML = '<span class="ticker-entries">' + entriesText;
        scrollContainer.innerHTML = copyHTML + copyHTML;

        var self = this;
        requestAnimationFrame(function () {
            var firstSpan = scrollContainer.querySelector('span');
            if (firstSpan) {
                var contentWidth = firstSpan.offsetWidth;
                var speedPixelsPerSecond = 45;
                var durationSeconds = Math.max(contentWidth / speedPixelsPerSecond, 50);
                scrollContainer.style.setProperty('--marquee-duration', durationSeconds + 's');
            }
        });

        // Pause marquee when tab hidden
        if (!this._marqueePausedByUs) {
            this._marqueePausedByUs = true;
            document.addEventListener('visibilitychange', function () {
                if (!scrollContainer) return;
                if (document.hidden) {
                    scrollContainer.style.animationPlayState = 'paused';
                } else {
                    scrollContainer.style.animationPlayState = 'running';
                }
            });
        }
    };

    MasterAudioPlayer.prototype.initializeSelects = function () {
        if (!this.dom.artistSelect) return;
        var artistNames = [];
        if (typeof artistData !== 'undefined') {
            artistNames = artistData.map(function (a) { return a.name; });
        } else {
            var unique = new Set(this.allReleases.map(function (r) { return r.artist; }));
            artistNames = Array.from(unique);
        }
        artistNames.sort(function (a, b) { return a.localeCompare(b); });
        var artistHtml = '<option value="all">ALL ARTISTS</option>';
        artistNames.forEach(function (name) {
            artistHtml += '<option value="' + name + '">' + name + '</option>';
        });
        this.dom.artistSelect.innerHTML = artistHtml;

        var params = new URLSearchParams(window.location.search);
        var artistNameParam = params.get('name');
        if (artistNameParam && artistNames.includes(artistNameParam)) {
            this.dom.artistSelect.value = artistNameParam;
        } else {
            this.dom.artistSelect.value = 'all';
        }
        this.populateReleases(this.dom.artistSelect.value);
    };

    MasterAudioPlayer.prototype.populateReleases = function (selectedArtistValue, selectedReleaseIdToMatch) {
        var filtered = [];
        if (selectedArtistValue === 'all') {
            filtered = this.allReleases;
        } else {
            filtered = this.allReleases.filter(function (r) {
                var rArtist = r.artist ? r.artist.toLowerCase().trim() : '';
                var selectArtist = selectedArtistValue.toLowerCase().trim();
                if (rArtist === 'somethin outta nothin') rArtist = 'something outta nothing';
                if (selectArtist === 'somethin outta nothin') selectArtist = 'something outta nothing';
                return rArtist === selectArtist;
            });
        }
        filtered = this._filterDuplicateSingles(filtered);
        this.initializeTickerStrip(filtered);

        if (this.dom.releaseSelect) {
            var releaseHtml = '';
            filtered.forEach(function (r) {
                var yearSuffix = r.releaseYear ? ' (' + r.releaseYear + ')' : '';
                releaseHtml += '<option value="' + r.id + '">' + r.title + yearSuffix + '</option>';
            });
            this.dom.releaseSelect.innerHTML = releaseHtml;
            if (selectedReleaseIdToMatch) {
                this.dom.releaseSelect.value = selectedReleaseIdToMatch;
            }
        }

        if (this.dom.releasesList) {
            this.dom.releasesList.innerHTML = '';
            filtered.forEach(function (r) {
                var cover = r.coverArt || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(r.title);
                var yearText = r.releaseYear || '';
                var tracksText = r.tracksCount ? r.tracksCount + ' Tracks' : '';
                var metaText = [yearText, tracksText].filter(Boolean).join(' \u2022 ');

                var row = document.createElement('div');
                row.className = 'player-release-row' + (r.id === this.activeAlbumId ? ' active' : '');
                row.dataset.id = r.id;
                row.onclick = (function (id) {
                    return function () { this.loadAlbum(id, 0, true); };
                }.call(this, r.id));
                row.innerHTML = '\n                    <div class="player-release-thumb">\n                        <img src="' + cover + '" alt="' + r.title + '" class="album-cover" onload="this.classList.add(\'loaded\')" onerror="this.src=\'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(r.title) + '\'">\n                    </div>\n                    <div class="player-release-details">\n                        <div class="player-release-title-text" title="' + r.title + '">' + r.title + '</div>\n                        <div class="player-release-artist-text">' + r.artist.toUpperCase() + '</div>\n                        <div class="player-release-meta-text">' + metaText + '</div>\n                    </div>\n                ';
                this.dom.releasesList.appendChild(row);
            }.bind(this));
        }
        this.updateReleaseNavigationButtons();
    };

    MasterAudioPlayer.prototype.updateReleaseNavigationButtons = function () {
        if (!this.dom.prevReleaseBtn || !this.dom.nextReleaseBtn || !this.dom.releaseSelect) return;
        var count = this.dom.releaseSelect.options.length;
        var hasReleases = count > 0;
        this.dom.prevReleaseBtn.disabled = !hasReleases;
        this.dom.nextReleaseBtn.disabled = !hasReleases;
    };

    MasterAudioPlayer.prototype.handleArtistSelectChange = function (artistName) {
        this.populateReleases(artistName);
        if (this.dom.releaseSelect && this.dom.releaseSelect.options.length > 0) {
            var firstReleaseId = this.dom.releaseSelect.options[0].value;
            this.loadAlbum(firstReleaseId, 0, false);
        }
    };

    MasterAudioPlayer.prototype.handleReleaseSelectChange = function (releaseId) {
        this.loadAlbum(releaseId, 0, false);
    };

    MasterAudioPlayer.prototype.nextRelease = function (autoPlay, event) {
        if (event) event.stopPropagation();
        autoPlay = autoPlay !== false;
        if (!this.allReleases || this.allReleases.length === 0) return;
        var idx = this.allReleases.findIndex(function (r) { return r.id === this.activeAlbumId; }.bind(this));
        if (idx === -1 && this.dom.releaseSelect) {
            idx = this.dom.releaseSelect.selectedIndex;
        }
        if (idx === -1) idx = 0;
        var nextIdx = (idx + 1) % this.allReleases.length;
        var nextReleaseId = this.allReleases[nextIdx].id;
        if (this.dom.releaseSelect) {
            this.dom.releaseSelect.value = nextReleaseId;
        }
        this.loadAlbum(nextReleaseId, 0, autoPlay);
    };

    MasterAudioPlayer.prototype.prevRelease = function (autoPlay, event) {
        if (event) event.stopPropagation();
        autoPlay = autoPlay !== false;
        if (!this.allReleases || this.allReleases.length === 0) return;
        var idx = this.allReleases.findIndex(function (r) { return r.id === this.activeAlbumId; }.bind(this));
        if (idx === -1 && this.dom.releaseSelect) {
            idx = this.dom.releaseSelect.selectedIndex;
        }
        if (idx === -1) idx = 0;
        var prevIdx = idx - 1;
        if (prevIdx < 0) prevIdx = this.allReleases.length - 1;
        var prevReleaseId = this.allReleases[prevIdx].id;
        if (this.dom.releaseSelect) {
            this.dom.releaseSelect.value = prevReleaseId;
        }
        this.loadAlbum(prevReleaseId, 0, autoPlay);
    };

    MasterAudioPlayer.prototype.toggleRepeat = function () {
        this.repeatMode = !this.repeatMode;
        localStorage.setItem('hr_player_repeat', this.repeatMode);
        var btn = document.getElementById('player-repeat-btn');
        if (btn) {
            if (this.repeatMode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    };

    MasterAudioPlayer.prototype.setSidebarTab = function (tabName) {
        if (!this.dom.tabTracks || !this.dom.tabLibrary) return;
        if (!this.dom.btnTabTracks || !this.dom.btnTabLibrary) return;
        this.dom.tabTracks.classList.remove('active');
        this.dom.tabLibrary.classList.remove('active');
        this.dom.btnTabTracks.classList.remove('active');
        this.dom.btnTabLibrary.classList.remove('active');
        if (tabName === 'library') {
            this.dom.tabLibrary.classList.add('active');
            this.dom.btnTabLibrary.classList.add('active');
        } else {
            this.dom.tabTracks.classList.add('active');
            this.dom.btnTabTracks.classList.add('active');
        }
    };

    MasterAudioPlayer.prototype.updateSidebarTabsVisibility = function () {
        if (!this.dom.btnTabTracks) return;
        if (this.playlist.length === 0) {
            this.dom.btnTabTracks.style.display = 'none';
            this.setSidebarTab('library');
        } else {
            this.dom.btnTabTracks.style.display = '';
        }
    };

    MasterAudioPlayer.prototype.setMode = function (mode) {
        var previewMode = this.dom.previewMode;
        var spotifyMode = this.dom.spotifyMode;
        var spotifyIframe = this.dom.spotifyIframe;
        var btnPreview = this.dom.btnModePreview;
        var btnSpotify = this.dom.btnModeSpotify;

        if (!previewMode || !spotifyMode) return;

        if (mode === 'spotify') {
            previewMode.style.display = 'none';
            spotifyMode.style.display = 'flex';
            if (btnPreview) btnPreview.classList.remove('active');
            if (btnSpotify) btnSpotify.classList.add('active');
            if (spotifyIframe && this.activeAlbumId) {
                spotifyIframe.src = 'https://open.spotify.com/embed/album/' + this.activeAlbumId + '?utm_source=generator';
            }
            if (this.audio) {
                this.audio.pause();
                this.audio = null;
            }
            this._stopProgressLoop();
            this.playerMode = 'spotify';
        } else {
            previewMode.style.display = '';
            spotifyMode.style.display = 'none';
            if (btnPreview) btnPreview.classList.add('active');
            if (btnSpotify) btnSpotify.classList.remove('active');
            if (spotifyIframe) spotifyIframe.src = '';
            this.playerMode = 'preview';
        }
    };

    MasterAudioPlayer.prototype.switchView = function (viewName) {
        var railItems = document.querySelectorAll('.ytm-rail-item');
        railItems.forEach(function (item) {
            var id = item.id || '';
            if (id === 'rail-btn-' + viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        var views = {
            'home': 'ytm-player-view',
            'explore': 'ytm-explore-view',
            'library': 'ytm-library-view',
            'profile': 'ytm-profile-view'
        };
        Object.keys(views).forEach(function (v) {
            var el = document.getElementById(views[v]);
            if (el) {
                if (v === viewName) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        });
    };

    MasterAudioPlayer.prototype.loadAlbum = function (albumId, trackIndex, autoPlay) {
        trackIndex = trackIndex || 0;
        autoPlay = autoPlay !== false;

        var now = Date.now();
        if (albumId === this.activeAlbumId && now - this._lastClickTime < 300) return;
        this._lastClickTime = now;

        if (this._loadingAlbumId) {
            this._pendingAlbumLoad = { albumId: albumId, trackIndex: trackIndex, autoPlay: autoPlay };
            return;
        }

        this._ensureDataReady((function (ready) {
            if (!ready) {
                if (this.dom.visualizerStatus) {
                    this.dom.visualizerStatus.textContent = 'STATUS: DATA NOT LOADED \u2014 TRY AGAIN';
                }
                this._flushPendingLoad();
                return;
            }

            this._loadingAlbumId = albumId;

            var album = albumData[albumId];
            if (!album || !album.tracks || album.tracks.length === 0) {
                if (this.dom.visualizerStatus) {
                    this.dom.visualizerStatus.textContent = 'STATUS: RELEASE DATA UNAVAILABLE';
                }
                this._loadingAlbumId = null;
                this._flushPendingLoad();
                return;
            }

            this.activeAlbumId = albumId;
            this.switchView('home');
            this.initializeTickerStrip();

            this.playlist = album.tracks.map(function (t, idx) {
                return {
                    title: t.title,
                    duration: t.duration,
                    previewUrl: t.previewUrl,
                    isExplicit: t.isExplicit,
                    uri: t.uri,
                    isPlayable: t.isPlayable,
                    playabilityReason: t.playabilityReason,
                    subtitle: t.subtitle,
                    isNineteenPlus: t.isNineteenPlus,
                    contentRatingLabels: t.contentRatingLabels,
                    uid: t.uid,
                    albumId: albumId,
                    albumTitle: album.title,
                    coverArt: album.coverArt,
                    artistName: album.artist,
                    index: idx
                };
            });

            if (this.dom.prevBtn) this.dom.prevBtn.disabled = false;
            if (this.dom.playBtn) this.dom.playBtn.disabled = false;
            if (this.dom.nextBtn) this.dom.nextBtn.disabled = false;

            this.renderTracklist();

            var rgb = album.visualIdentity && album.visualIdentity.backgroundBase ? album.visualIdentity.backgroundBase : { red: 139, green: 0, blue: 0 };
            var glowColor = 'rgb(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ')';
            var maxVal = Math.max(rgb.red, rgb.green, rgb.blue);
            if (maxVal > 0) {
                var r = rgb.red / 255;
                var g = rgb.green / 255;
                var b = rgb.blue / 255;
                var max = Math.max(r, g, b);
                var min = Math.min(r, g, b);
                var h = 0;
                if (max !== min) {
                    var d = max - min;
                    switch (max) {
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h /= 6;
                }
                var hue = Math.round(h * 360);
                glowColor = 'hsl(' + hue + ', 100%, 65%)';
            } else {
                glowColor = 'hsl(0, 100%, 65%)';
            }

            if (this._domCoreWidget) {
                this._domCoreWidget.style.setProperty('--album-glow-color', glowColor);
            }

            if (this._domCoverContainer) {
                this._domCoverContainer.style.boxShadow = '0 15px 45px rgba(0, 0, 0, 0.8), 0 0 30px rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.45)';
                this._domCoverContainer.style.borderColor = 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.6)';
            }

            if (this._domCenterTitle) {
                this._domCenterTitle.innerHTML = 'Now Playing: <span class="title-name">' + album.title + '</span>';
            }
            if (this._domCenterArtist) {
                this._domCenterArtist.textContent = album.artist;
            }

            if (this._domSpotifyBtn) {
                this._domSpotifyBtn.href = 'https://open.spotify.com/album/' + albumId;
                this._domSpotifyBtn.style.display = 'inline-flex';
            }

            if (this._domExtraLinks) {
                this._domExtraLinks.innerHTML = '';
                if (typeof artistData !== 'undefined') {
                    var artistMap = this._artistMap;
                    var artist = artistMap.get(album.artist.toLowerCase().trim());
                    if (artist) {
                        var profileBtn = document.createElement('a');
                        profileBtn.href = (isLocalhost ? 'artist.html' : '/artist') + '?name=' + encodeURIComponent(artist.name);
                        profileBtn.className = 'artist-link-btn profile-link-btn';
                        profileBtn.innerHTML = '\n                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">\n                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>\n                            </svg>\n                            Profile\n                        ';
                        this._domExtraLinks.appendChild(profileBtn);

                        if (artist.website) {
                            var webBtn = document.createElement('a');
                            webBtn.href = artist.website;
                            webBtn.target = '_blank';
                            webBtn.rel = 'noopener noreferrer';
                            webBtn.className = 'artist-link-btn website-link-btn';
                            webBtn.innerHTML = '\n                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">\n                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>\n                                </svg>\n                                Website\n                            ';
                            this._domExtraLinks.appendChild(webBtn);
                        }

                        if (artist.instagram) {
                            var instaBtn = document.createElement('a');
                            instaBtn.href = artist.instagram;
                            instaBtn.target = '_blank';
                            instaBtn.rel = 'noopener noreferrer';
                            instaBtn.className = 'artist-link-btn instagram-link-btn';
                            instaBtn.innerHTML = '\n                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">\n                                    <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4c0 3.2-2.6 5.8-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8C2 4.6 4.6 2 7.8 2zm-.2 2C5.6 4 4 5.6 4 7.6v8.8C4 18.4 5.6 20 7.6 20h8.8c2 0 3.6-1.6 3.6-3.6V7.6C20 5.6 18.4 4 16.4 4H7.6zm10.9 2.1c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9zM12 7c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5 2.2-5 5-5zm0 2c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"/>\n                                </svg>\n                                Instagram\n                            ';
                            this._domExtraLinks.appendChild(instaBtn);
                        }
                    }
                }
            }

            if (this.dom.lyricsContent) {
                var bio = "No biography available.";
                if (typeof artistData !== 'undefined') {
                    var artistMap2 = this._artistMap;
                    var artist2 = artistMap2.get(album.artist.toLowerCase().trim());
                    if (artist2 && artist2.description) {
                        bio = artist2.description;
                    }
                }
                this.dom.lyricsContent.textContent = bio;
            }

            if (this.dom.artistSelect && this.dom.releaseSelect) {
                var artistName = album.artist;
                var artistOptionExists = false;
                for (var i = 0; i < this.dom.artistSelect.options.length; i++) {
                    if (this.dom.artistSelect.options[i].value === artistName) {
                        artistOptionExists = true;
                        break;
                    }
                }
                var targetArtistVal = artistOptionExists ? artistName : 'all';
                if (this.dom.artistSelect.value !== targetArtistVal || this.dom.releaseSelect.value !== albumId) {
                    this.dom.artistSelect.value = targetArtistVal;
                    this.populateReleases(targetArtistVal, albumId);
                } else {
                    this.dom.releaseSelect.value = albumId;
                }
            }

            if (this.dom.releasesList) {
                var rows = this.dom.releasesList.querySelectorAll('.player-release-row');
                rows.forEach(function (row) {
                    if (row.dataset.id === albumId) {
                        row.classList.add('active');
                    } else {
                        row.classList.remove('active');
                    }
                });
            }

            this.updateSidebarTabsVisibility();
            if (autoPlay) {
                this.setSidebarTab('tracks');
            }
            this.selectTrack(trackIndex, autoPlay);
            this._loadingAlbumId = null;
            this._flushPendingLoad();
        }).bind(this));
    };

    MasterAudioPlayer.prototype.selectTrack = function (index, autoPlay) {
        autoPlay = autoPlay !== false;
        if (index < 0 || index >= this.playlist.length) return;
        this.currentIndex = index;
        var track = this.playlist[this.currentIndex];

        if (this.audio) {
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
            this._stopProgressLoop();
        }

        var coverUrl = track.coverArt || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(track.albumTitle);
        if (this.dom.cover) {
            this.dom.cover.src = coverUrl;
            this.dom.cover.alt = track.albumTitle + ' album cover by ' + track.artistName;
        }
        if (this.dom.bottomThumb) {
            this.dom.bottomThumb.src = coverUrl;
            this.dom.bottomThumb.alt = track.albumTitle + ' thumbnail';
        }
        if (this.dom.blurBg) {
            this.dom.blurBg.style.backgroundImage = "url('" + coverUrl + "')";
        }
        if (this.dom.trackTitle) this.dom.trackTitle.textContent = track.title;
        if (this.dom.artist) this.dom.artist.textContent = track.artistName;
        if (this.dom.albumTitle) this.dom.albumTitle.textContent = track.albumTitle;
        if (this.dom.visualizerStatus) this.dom.visualizerStatus.textContent = 'STATUS: LOADING';

        this.updatePageTrackHighlights();

        if (!track.previewUrl) {
            if (this.dom.visualizerStatus) this.dom.visualizerStatus.textContent = 'STATUS: PREVIEW UNAVAILABLE';
            this._setPlayBtnSvg('play');
            this.isPlaying = false;
            this.toggleVisualizer(false);
            return;
        }

        this.audio = new Audio(track.previewUrl);
        this.audio.volume = this.volume;

        this.audio.addEventListener('play', (function () {
            this.isPlaying = true;
            this._setPlayBtnSvg('pause');
            this._startProgressLoop();
            if (this.dom.visualizerStatus) this.dom.visualizerStatus.textContent = 'STATUS: PLAYING (30S PREVIEW)';
            this.toggleVisualizer(true);
            this.updatePageTrackHighlights();
        }).bind(this));

        this.audio.addEventListener('pause', (function () {
            this.isPlaying = false;
            this._setPlayBtnSvg('play');
            this._stopProgressLoop();
            if (this.dom.visualizerStatus) this.dom.visualizerStatus.textContent = 'STATUS: PAUSED';
            this.toggleVisualizer(false);
            this.updatePageTrackHighlights();
        }).bind(this));

        this.audio.addEventListener('ended', (function () {
            this._stopProgressLoop();
            if (this.currentIndex < this.playlist.length - 1) {
                this.next();
            } else {
                if (this.repeatMode) {
                    this.selectTrack(0, true);
                } else {
                    this.nextRelease(true);
                }
            }
        }).bind(this));

        if (autoPlay) {
            this.audio.play().catch((function (err) {
                console.error("Playback failed:", err.message);
                if (this.dom.visualizerStatus) this.dom.visualizerStatus.textContent = 'STATUS: PLAYBACK FAILED \u2014 TRY AGAIN';
                this._setPlayBtnSvg('play');
                this.isPlaying = false;
                this.toggleVisualizer(false);
            }).bind(this));
        } else {
            this._setPlayBtnSvg('play');
            if (this.dom.visualizerStatus) this.dom.visualizerStatus.textContent = 'STATUS: STANDBY';
            this.toggleVisualizer(false);
        }
    };

    MasterAudioPlayer.prototype.togglePlay = function () {
        if (!this.audio) return;
        if (this.isPlaying) {
            this.audio.pause();
        } else {
            this.audio.play().catch((function (err) {
                console.error(err.message);
                if (this.dom.visualizerStatus) this.dom.visualizerStatus.textContent = 'STATUS: PLAYBACK FAILED \u2014 TRY AGAIN';
            }).bind(this));
        }
    };

    MasterAudioPlayer.prototype.next = function () {
        if (this.playlist.length === 0) return;
        var nextIndex = this.currentIndex + 1;
        if (nextIndex >= this.playlist.length) {
            if (this.repeatMode) {
                nextIndex = 0;
            } else {
                return this.nextRelease(true);
            }
        }
        this.selectTrack(nextIndex, true);
    };

    MasterAudioPlayer.prototype.prev = function () {
        if (this.playlist.length === 0) return;
        var prevIndex = this.currentIndex - 1;
        if (prevIndex < 0) prevIndex = this.playlist.length - 1;
        this.selectTrack(prevIndex, true);
    };

    MasterAudioPlayer.prototype.seek = function (event) {
        if (!this.audio) return;
        var timeline = document.querySelector('.ytm-timeline-container');
        if (!timeline) return;
        var rect = timeline.getBoundingClientRect();
        var clickX = event.clientX - rect.left;
        var percent = clickX / rect.width;
        this.audio.currentTime = percent * this.audio.duration;
        this.updateProgress();
    };

    MasterAudioPlayer.prototype.setVolume = function (val) {
        this.volume = parseFloat(val);
        localStorage.setItem('hr_player_volume', this.volume);
        if (this.audio) {
            this.audio.volume = this.volume;
        }
        this.updateVolumeSliderFill();
    };

    MasterAudioPlayer.prototype.updateVolumeSliderFill = function () {
        var slider = document.getElementById('player-volume-slider');
        if (slider) {
            var pct = slider.value * 100;
            slider.style.background = 'linear-gradient(90deg, #ff003c 0%, #ff003c ' + pct + '%, rgba(255, 255, 255, 0.1) ' + pct + '%, rgba(255, 255, 255, 0.1) 100%)';
        }
    };

    MasterAudioPlayer.prototype.updateProgress = function () {
        if (!this.audio || isNaN(this.audio.duration)) {
            if (this.dom.progressBar) this.dom.progressBar.style.width = '0%';
            var timeline = document.querySelector('.ytm-timeline-container');
            if (timeline) {
                timeline.style.setProperty('--progress-percent', '0%');
            }
            if (this.dom.timeCurrent) this.dom.timeCurrent.textContent = '0:00';
            if (this.dom.timeTotal) this.dom.timeTotal.textContent = '0:00';
            return;
        }

        var cur = this.audio.currentTime;
        var dur = this.audio.duration;
        var pct = (cur / dur) * 100;

        if (this.dom.progressBar) {
            this.dom.progressBar.style.width = pct + '%';
            var timeline2 = document.querySelector('.ytm-timeline-container');
            if (timeline2) {
                timeline2.style.setProperty('--progress-percent', pct + '%');
            }
        }

        var formatTime = function (time) {
            var min = Math.floor(time / 60);
            var sec = String(Math.floor(time % 60)).padStart(2, '0');
            return min + ':' + sec;
        };

        if (this.dom.timeCurrent) this.dom.timeCurrent.textContent = formatTime(cur);
        if (this.dom.timeTotal) this.dom.timeTotal.textContent = formatTime(dur);
    };

    MasterAudioPlayer.prototype.toggleTracklist = function () {
        // Safe legacy no-op
    };

    MasterAudioPlayer.prototype.toggleVisualizer = function (active) {
        if (!this.dom.visualizerBars) return;
        if (active) {
            this.dom.visualizerBars.classList.add('active');
        } else {
            this.dom.visualizerBars.classList.remove('active');
        }
    };

    MasterAudioPlayer.prototype.renderTracklist = function () {
        if (!this.dom.rowsContainer) return;
        this.dom.rowsContainer.innerHTML = '';

        var activeAlbum = typeof albumData !== 'undefined' ? albumData[this.activeAlbumId] : null;
        var coverUrl = (activeAlbum && activeAlbum.coverArt) ? activeAlbum.coverArt : 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(this.activeAlbumId);

        this.playlist.forEach(function (track, idx) {
            var trackSec = Math.floor(track.duration / 1000);
            var tMin = Math.floor(trackSec / 60);
            var tSec = String(trackSec % 60).padStart(2, '0');
            var tDuration = tMin + ':' + tSec;

            var row = document.createElement('div');
            row.className = 'ytm-track-row' + (idx === this.currentIndex ? ' active' : '');
            row.onclick = (function (i) {
                return function () {
                    if (this.currentIndex === i) {
                        this.togglePlay();
                    } else {
                        this.selectTrack(i, true);
                    }
                }.bind(this);
            }.bind(this)(idx));

            row.innerHTML = '\n                <div class="ytm-track-row-left">\n                    <div class="ytm-track-thumb">\n                        <img src="' + coverUrl + '" alt="" class="album-cover" onload="this.classList.add(\'loaded\')" onerror="this.src=\'https://api.dicebear.com/7.x/shapes/svg?seed=' + idx + '\'">\n                    </div>\n                    <div class="ytm-track-details">\n                        <div class="ytm-track-title-text" title="' + track.title + '">' + track.title + '</div>\n                        <div class="ytm-track-artist-text">' + track.artistName + '</div>\n                    </div>\n                </div>\n                <div class="ytm-track-row-right">\n                    <span>' + tDuration + '</span>\n                </div>\n            ';
            this.dom.rowsContainer.appendChild(row);
        }.bind(this));
    };

    MasterAudioPlayer.prototype.updatePageTrackHighlights = function () {
        if (this.dom.rowsContainer) {
            var rows = this.dom.rowsContainer.querySelectorAll('.ytm-track-row');
            rows.forEach(function (row, idx) {
                if (idx === this.currentIndex) {
                    row.classList.add('active');
                } else {
                    row.classList.remove('active');
                }
            }.bind(this));
        }
    };

    MasterAudioPlayer.prototype.renderArtistProfile = function (artistName) {
        var content = document.getElementById('ytm-artist-profile-content');
        if (!content) return;

        var artistMap = this._artistMap;
        var artist = artistMap.get(artistName);

        if (!artist) {
            content.innerHTML = '<h1 style="color: white; text-align: center; font-family: Orbitron, sans-serif; padding: 80px 0;">Artist Not Found</h1>';
            return;
        }

        var pageTitle = artist.name + ' | Horrorcore Reshare';
        var pageDesc = artist.description
            ? artist.description.substring(0, 160) + '...'
            : document.title;
        var pageImg = artist.img && !artist.img.startsWith('http')
            ? window.location.origin + '/' + artist.img
            : artist.img;

        document.title = pageTitle;

        var updateMeta = function (property, content) {
            var el = document.querySelector('meta[property="' + property + '"]')
                || document.querySelector('meta[name="' + property + '"]');
            if (el) el.setAttribute('content', content);
        };

        updateMeta('og:title', pageTitle);
        updateMeta('og:description', pageDesc);
        updateMeta('og:url', window.location.origin + '/artist?name=' + encodeURIComponent(artist.name));
        if (pageImg) updateMeta('og:image', pageImg);
        updateMeta('description', pageDesc);
        updateMeta('twitter:title', pageTitle);
        updateMeta('twitter:description', pageDesc);
        if (pageImg) updateMeta('twitter:image', pageImg);

        var canonicalEl = document.getElementById('canonical-link');
        if (canonicalEl) {
            canonicalEl.setAttribute('href', window.location.origin + '/artist?name=' + encodeURIComponent(artist.name));
        }

        var backBtn = document.querySelector('.back-to-player-link');
        if (backBtn) {
            backBtn.setAttribute('href', isLocalhost ? 'index.html' : '/');
        }

        var sameAsLinks = [];
        if (artist.spotify) sameAsLinks.push(artist.spotify);
        if (artist.instagram) sameAsLinks.push(artist.instagram);
        if (artist.website) sameAsLinks.push(artist.website);
        if (artist.youtube) sameAsLinks.push(artist.youtube);

        var mappedReleasesForSchema = (artist.releases || []).map(function (id) {
            var album = typeof albumData !== 'undefined' ? albumData[id] : null;
            if (!album) return null;
            var obj = { id: id };
            for (var k in album) { if (album.hasOwnProperty(k)) obj[k] = album[k]; }
            return obj;
        }).filter(function (album) {
            if (!album || !album.artist) return false;
            var albumArtist = album.artist.toLowerCase().trim();
            var profileArtist = artist.name.toLowerCase().trim();
            if (albumArtist === 'somethin outta nothin') albumArtist = 'something outta nothing';
            if (profileArtist === 'somethin outta nothin') profileArtist = 'something outta nothing';
            return albumArtist === profileArtist;
        });

        var albumsSchema = mappedReleasesForSchema.map(function (album) {
            return {
                '@type': 'MusicAlbum',
                'name': album.title,
                'url': album.spotifyUrl || 'https://open.spotify.com/album/' + album.id,
                'image': album.coverArt || '',
                'datePublished': album.releaseDate || album.releaseYear || '',
                'numTracks': album.tracksCount || 0
            };
        });

        var artistSchema = {
            '@context': 'https://schema.org',
            '@type': 'MusicGroup',
            'name': artist.name,
            'description': artist.description || '',
            'image': pageImg,
            'url': window.location.origin + '/artist?name=' + encodeURIComponent(artist.name),
            'sameAs': sameAsLinks,
            'album': albumsSchema
        };

        document.querySelectorAll('script[type="application/ld+json"]').forEach(function (el) { el.remove(); });

        var scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.text = JSON.stringify(artistSchema);
        document.head.appendChild(scriptEl);

        var breadcrumb = {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {
                    '@type': 'ListItem',
                    'position': 1,
                    'name': 'Home',
                    'item': window.location.origin + '/'
                },
                {
                    '@type': 'ListItem',
                    'position': 2,
                    'name': 'Artists',
                    'item': window.location.origin + '/artists'
                },
                {
                    '@type': 'ListItem',
                    'position': 3,
                    'name': artist.name,
                    'item': window.location.origin + '/artist?name=' + encodeURIComponent(artist.name)
                }
            ]
        };
        var bcEl = document.createElement('script');
        bcEl.type = 'application/ld+json';
        bcEl.text = JSON.stringify(breadcrumb);
        document.head.appendChild(bcEl);

        var releasesHTML = '';
        if (artist.releases && artist.releases.length > 0 && typeof albumData !== 'undefined') {
            var mappedReleases = artist.releases.map(function (id) {
                var album = albumData[id] || null;
                if (!album) return null;
                var obj = { id: id };
                for (var k in album) { if (album.hasOwnProperty(k)) obj[k] = album[k]; }
                return obj;
            }).filter(function (album) {
                if (!album || !album.artist) return false;
                var albumArtist = album.artist.toLowerCase().trim();
                var profileArtist = artist.name.toLowerCase().trim();
                if (albumArtist === 'somethin outta nothin') albumArtist = 'something outta nothing';
                if (profileArtist === 'somethin outta nothin') profileArtist = 'something outta nothing';
                return albumArtist === profileArtist;
            });

            var albumsAndEPs = mappedReleases.filter(function (r) { return (r.tracksCount || 0) > 1; });
            var singles = mappedReleases.filter(function (r) { return (r.tracksCount || 0) === 1; });

            var albumTrackTitles = new Set();
            albumsAndEPs.forEach(function (album) {
                if (album.tracks) {
                    album.tracks.forEach(function (track) {
                        if (track.title) albumTrackTitles.add(track.title.toLowerCase().trim());
                    });
                }
            });

            var filteredSingles = singles.filter(function (single) {
                var singleTrack = single.tracks && single.tracks[0];
                if (singleTrack && singleTrack.title) {
                    return !albumTrackTitles.has(singleTrack.title.toLowerCase().trim());
                }
                return true;
            });

            var sortByDate = function (list) {
                return list.sort(function (a, b) {
                    var yearA = a.releaseYear || '';
                    var yearB = b.releaseYear || '';
                    if (yearA !== yearB) return yearB.localeCompare(yearA);
                    var dateA = a.releaseDate || '';
                    var dateB = b.releaseDate || '';
                    if (dateA && dateB) return dateB.localeCompare(dateA);
                    if (dateA) return -1;
                    if (dateB) return 1;
                    return a.title.localeCompare(b.title);
                });
            };

            var sortedAlbums = sortByDate(albumsAndEPs);
            var sortedSingles = sortByDate(filteredSingles);

            var renderCard = function (album) {
                var cover = album.coverArt || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(album.title) + '&backgroundColor=050505&shape1Color=8b0000';
                var tracksCountVal = album.tracksCount || (album.tracks ? album.tracks.length : 0);
                var tracksBadgeText = tracksCountVal + ' TRACK' + (tracksCountVal !== 1 ? 'S' : '');

                var totalSec = Math.floor((album.totalDuration || 0) / 1000);
                var min = Math.floor(totalSec / 60);
                var sec = totalSec % 60;
                var durationStr = min > 0 ? min + 'm ' + sec + 's' : sec + 's';

                var rgb = album.visualIdentity && album.visualIdentity.backgroundBase ? album.visualIdentity.backgroundBase : { red: 139, green: 0, blue: 0 };
                var shadowColor = 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.35)';
                var borderColor = 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.2)';
                var borderHoverColor = 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.8)';

                var preReleaseBadge = album.isPreRelease ? '\n                    <span style="background: rgba(255,204,0,0.15); color: #ffcc00; font-family: \'Share Tech Mono\', monospace; font-size: 0.65rem; padding: 3px 8px; border-radius: 3px; border: 1px solid rgba(255,204,0,0.4); text-shadow: 0 0 5px rgba(255,204,0,0.5); font-weight: bold; letter-spacing: 0.5px;">PRE-RELEASE</span>\n                ' : '';

                var displayDate = album.releaseYear || '';
                if (album.releaseDate) {
                    try {
                        var dateObj = new Date(album.releaseDate);
                        if (!isNaN(dateObj.getTime())) {
                            var year = dateObj.getUTCFullYear();
                            var month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
                            var day = dateObj.getUTCDate();
                            displayDate = month + ' ' + day + ', ' + year;
                        }
                    } catch (e) { }
                }

                return '\n                    <div class="hr-album-card hr-glass" style="display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; border: 1px solid ' + borderColor + '; transition: all 0.3s ease; height: 100%; position: relative; cursor: pointer;" onmouseover="this.style.borderColor=\'' + borderHoverColor + '\'; this.style.boxShadow=\'0 10px 30px ' + shadowColor + '\';" onmouseout="this.style.borderColor=\'' + borderColor + '\'; this.style.boxShadow=\'none\';" onclick="window.open(\'https://open.spotify.com/album/' + album.id + '\', \'_blank\', \'noopener,noreferrer\')">\n                        <div style="position: absolute; top: 12px; left: 12px; z-index: 10; display: flex; gap: 8px; flex-wrap: wrap;" onclick="event.stopPropagation()">\n                            <span style="background: rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.85); color: #fff; font-family: \'Share Tech Mono\', monospace; font-size: 0.65rem; padding: 3px 8px; border-radius: 3px; font-weight: bold; border: 1px solid rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.5); text-shadow: 0 0 5px rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.8); letter-spacing: 1px;">' + tracksBadgeText + '</span>\n                            <span style="background: rgba(0,0,0,0.7); color: #ffcc00; font-family: \'Share Tech Mono\', monospace; font-size: 0.65rem; padding: 3px 8px; border-radius: 3px; border: 1px solid rgba(255,204,0,0.3); text-shadow: 0 0 5px #ffcc00;">' + durationStr + '</span>\n                            ' + preReleaseBadge + '\n                        </div>\n                        <div style="position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; border-bottom: 1px solid rgba(139, 0, 0, 0.1);">\n                            <img src="' + cover + '" alt="' + album.title + '" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;" class="album-cover" loading="lazy" onload="this.classList.add(\'loaded\')" onerror="this.src=\'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(album.title) + '&backgroundColor=050505&shape1Color=8b0000\'">\n                        </div>\n                        <div style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 15px;">\n                            <div>\n<h3 class="hr-album-title" style="font-family: \'Orbitron\', sans-serif; font-size: 0.95rem; color: #fff; margin: 0 0 6px; line-height: 1.4; letter-spacing: 1px;" title="' + album.title + '">' + album.title + '</h3>\n                                <p style="font-family: \'Share Tech Mono\', monospace; color: var(--hr-blood); font-size: 0.8rem; margin: 0 0 6px 0; font-weight: bold; letter-spacing: 0.5px;">' + album.artist.toUpperCase() + '</p>\n                                ' + (displayDate ? '<p style="font-family: \'Share Tech Mono\', monospace; color: var(--hr-text-muted); font-size: 0.7rem; margin: 0; letter-spacing: 0.5px;">' + displayDate.toUpperCase() + '</p>' : '') + '\n                            </div>\n                        </div>\n                    </div>\n                ';
            };

            if (sortedAlbums.length > 0) {
                releasesHTML += '\n                    <div style="margin-top: 36px;">\n                        <h2 class="artist-releases-heading">Albums & EPs</h2>\n                        <div class="artist-releases-grid">\n                            ' + sortedAlbums.map(renderCard).join('') + '\n                        </div>\n                    </div>\n                ';
            }
            if (sortedSingles.length > 0) {
                releasesHTML += '\n                    <div style="margin-top: 48px;">\n                        <h2 class="artist-releases-heading">Singles</h2>\n                        <div class="artist-releases-grid">\n                            ' + sortedSingles.map(renderCard).join('') + '\n                        </div>\n                    </div>\n                ';
            }
        }

        var fallbackImg = 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(artist.name) + '&backgroundColor=050505&shape1Color=8b0000';

        content.innerHTML = '\n            <div class="ytm-profile-banner">\n                <img src="' + artist.img + '" alt="' + artist.name + '" class="ytm-profile-banner-img" onload="this.classList.add(\'loaded\')" onerror="this.src=\'' + fallbackImg + '\'">\n                <div class="ytm-profile-banner-overlay">\n                    <div class="ytm-profile-avatar-wrap">\n                        <img src="' + artist.img + '" alt="' + artist.name + '" class="ytm-profile-avatar" onload="this.classList.add(\'loaded\')" onerror="this.src=\'' + fallbackImg + '\'">\n                    </div>\n                    <div style="display: flex; flex-direction: column; align-items: flex-start;">\n                        <h1 class="ytm-profile-name">' + artist.name + '</h1>\n                    </div>\n                </div>\n                <div class="artist-profile-links-container">\n                    ' + (artist.spotify ? '<a href="' + artist.spotify + '" target="_blank" rel="noopener noreferrer" class="artist-profile-btn spotify">\n                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.893-.982-.336.075-.668-.135-.744-.47-.077-.337.135-.668.47-.743 3.856-.88 7.15-.502 9.822 1.13.295.178.387.563.207.858zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.847-.107-.972-.52-.125-.413.108-.847.52-.972 3.67-1.114 8.24-.57 11.346 1.34.367.226.488.707.26 1.074zm.107-2.846C14.34 8.752 8.44 8.557 5.006 9.6c-.53.16-1.09-.14-1.25-.67-.16-.53.14-1.09.67-1.25 3.943-1.196 10.457-.97 14.464 1.407.476.28.63.9.35 1.376-.28.477-.9.63-1.376.35z"/></svg>\n                        SPOTIFY\n                    </a>' : '') + '\n                    ' + (artist.instagram ? '<a href="' + artist.instagram + '" target="_blank" rel="noopener noreferrer" class="artist-profile-btn instagram">\n                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>\n                        INSTAGRAM\n                    </a>' : '') + '\n                    ' + (artist.website ? '<a href="' + artist.website + '" target="_blank" rel="noopener noreferrer" class="artist-profile-btn website">\n                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>\n                        WEBSITE\n                    </a>' : '') + '\n                    ' + (artist.youtube ? '<a href="' + artist.youtube + '" target="_blank" rel="noopener noreferrer" class="artist-profile-btn youtube">\n                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>\n                        YOUTUBE\n                    </a>' : '') + '\n                </div>\n            </div>\n\n            <div class="ytm-profile-bio">\n                ' + (artist.description || "No biography available.") + '\n            </div>\n\n            ' + releasesHTML + '\n        ';

        if (window.hrPlayer) {
            window.hrPlayer.updatePageTrackHighlights();
        }
    };

    return MasterAudioPlayer;
})();

window.hrPlayer = new MasterAudioPlayer();

window.playerTogglePlay = function (event) {
    if (event) event.stopPropagation();
    window.hrPlayer.togglePlay();
};
window.playerNextTrack = function (event) {
    if (event) event.stopPropagation();
    window.hrPlayer.next();
};
window.playerPrevTrack = function (event) {
    if (event) event.stopPropagation();
    window.hrPlayer.prev();
};
window.playerSeek = function (event) {
    window.hrPlayer.seek(event);
};
window.playerSetVolume = function (val) {
    window.hrPlayer.setVolume(val);
};
window.playerToggleTracklist = function (event) {
    if (event) event.stopPropagation();
    window.hrPlayer.toggleTracklist();
};
window.playerSetMode = function (mode, event) {
    if (event) event.stopPropagation();
    window.hrPlayer.setMode(mode);
};

window.playTrackPreview = function (url, trackId, event) {
    if (event) event.stopPropagation();
    var match = trackId.match(/^([^-]+)-(\d+)$/);
    if (match) {
        var albumId = match[1];
        var trackIdx = parseInt(match[2]);
        var isCurrentAlbum = window.hrPlayer.playlist.length > 0 &&
            window.hrPlayer.playlist[0].albumId === albumId;
        if (isCurrentAlbum) {
            if (window.hrPlayer.currentIndex === trackIdx) {
                window.hrPlayer.togglePlay();
            } else {
                window.hrPlayer.selectTrack(trackIdx, true);
            }
        } else {
            window.hrPlayer.loadAlbum(albumId, trackIdx, true);
        }
    }
};

window.loadAlbumToPlayer = function (albumId, autoPlay) {
    autoPlay = autoPlay !== false;
    window.hrPlayer.loadAlbum(albumId, 0, autoPlay);
};

function renderGlobalAlbumGrid() {
    var albumGrid = document.getElementById('album-grid');
    if (!albumGrid || typeof albumData === 'undefined') return;

    var albums = window.hrPlayer.allReleases;

    function render(query) {
        query = query || '';
        var filteredAlbums = albums.filter(function (album) {
            var titleMatch = album.title.toLowerCase().includes(query);
            var artistMatch = album.artist.toLowerCase().includes(query);
            return titleMatch || artistMatch;
        });

        if (filteredAlbums.length === 0) {
            albumGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--hr-text-muted); font-family: \'Share Tech Mono\', monospace; padding: 40px 0;">NO ALBUMS FOUND</div>';
            return;
        }

        albumGrid.innerHTML = filteredAlbums.map(function (album) {
            var cover = album.coverArt || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(album.title) + '&backgroundColor=050505&shape1Color=8b0000';
            var tracksCountVal = album.tracksCount || (album.tracks ? album.tracks.length : 0);
            var tracksBadgeText = tracksCountVal + ' TRACK' + (tracksCountVal !== 1 ? 'S' : '');

            var totalSec = Math.floor((album.totalDuration || 0) / 1000);
            var min = Math.floor(totalSec / 60);
            var sec = totalSec % 60;
            var durationStr = min > 0 ? min + 'm ' + sec + 's' : sec + 's';

            var rgb = album.visualIdentity && album.visualIdentity.backgroundBase ? album.visualIdentity.backgroundBase : { red: 139, green: 0, blue: 0 };
            var shadowColor = 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.35)';
            var borderColor = 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.2)';
            var borderHoverColor = 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.8)';

            var preReleaseBadge = album.isPreRelease ? '\n                <span style="background: rgba(255,204,0,0.15); color: #ffcc00; font-family: \'Share Tech Mono\', monospace; font-size: 0.65rem; padding: 3px 8px; border-radius: 3px; border: 1px solid rgba(255,204,0,0.4); text-shadow: 0 0 5px rgba(255,204,0,0.5); font-weight: bold; letter-spacing: 0.5px;">PRE-RELEASE</span>\n            ' : '';

            var displayDate = album.releaseYear || '';
            if (album.releaseDate) {
                try {
                    var dateObj = new Date(album.releaseDate);
                    if (!isNaN(dateObj.getTime())) {
                        var year = dateObj.getUTCFullYear();
                        var month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
                        var day = dateObj.getUTCDate();
                        displayDate = month + ' ' + day + ', ' + year;
                    }
                } catch (e) { }
            }

            return '\n                <div class="hr-album-card hr-glass" style="display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; border: 1px solid ' + borderColor + '; transition: all 0.3s ease; height: 100%; position: relative; cursor: pointer;" onmouseover="this.style.borderColor=\'' + borderHoverColor + '\'; this.style.boxShadow=\'0 10px 30px ' + shadowColor + '\';" onmouseout="this.style.borderColor=\'' + borderColor + '\'; this.style.boxShadow=\'none\';" onclick="loadAlbumToPlayer(\'' + album.id + '\', true)">\n                    <div style="position: absolute; top: 12px; left: 12px; z-index: 10; display: flex; gap: 8px; flex-wrap: wrap;" onclick="event.stopPropagation()">\n                        <span style="background: rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.85); color: #fff; font-family: \'Share Tech Mono\', monospace; font-size: 0.65rem; padding: 3px 8px; border-radius: 3px; font-weight: bold; border: 1px solid rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.5); text-shadow: 0 0 5px rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', 0.8); letter-spacing: 1px;">' + tracksBadgeText + '</span>\n                        <span style="background: rgba(0,0,0,0.7); color: #ffcc00; font-family: \'Share Tech Mono\', monospace; font-size: 0.65rem; padding: 3px 8px; border-radius: 3px; border: 1px solid rgba(255,204,0,0.3); text-shadow: 0 0 5px #ffcc00;">' + durationStr + '</span>\n                        ' + preReleaseBadge + '\n                    </div>\n                    <div style="position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; border-bottom: 1px solid rgba(139, 0, 0, 0.1);">\n                        <img src="' + cover + '" alt="' + album.title + '" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;" class="album-cover" loading="lazy" onload="this.classList.add(\'loaded\')" onerror="this.src=\'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(album.title) + '&backgroundColor=050505&shape1Color=8b0000\'">\n                    </div>\n                    <div style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 15px;">\n                        <div>\n                            <h3 class="hr-album-title" style="font-family: \'Orbitron\', sans-serif; font-size: 0.95rem; color: #fff; margin: 0 0 6px; line-height: 1.4; letter-spacing: 1px;" title="' + album.title + '">' + album.title + '</h3>\n                            <p style="font-family: \'Share Tech Mono\', monospace; color: var(--hr-blood); font-size: 0.8rem; margin: 0 0 6px 0; font-weight: bold; letter-spacing: 0.5px;">' + album.artist.toUpperCase() + '</p>\n                            ' + (displayDate ? '<p style="font-family: \'Share Tech Mono\', monospace; color: var(--hr-text-muted); font-size: 0.7rem; margin: 0; letter-spacing: 0.5px;">' + displayDate.toUpperCase() + '</p>' : '') + '\n                        </div>\n                    </div>\n                </div>\n            ';
        }).join('');

        if (window.hrPlayer) {
            window.hrPlayer.updatePageTrackHighlights();
        }
    }

    var searchInput = document.getElementById('catalog-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            var query = searchInput.value.toLowerCase();
            render(query);
            if (window.hrPlayer) {
                var queryFiltered = albums.filter(function (album) {
                    var titleMatch = album.title.toLowerCase().includes(query);
                    var artistMatch = album.artist.toLowerCase().includes(query);
                    return titleMatch || artistMatch;
                });
                window.hrPlayer.initializeTickerStrip(queryFiltered);
            }
        });
    }

    render();
}

// EXECUTE
initCanvas();
injectHeader();
injectFooter();

// Set nav bar version from CDN build version (set by bootloader)
(function setNavVersion() {
    var el = document.getElementById('nav-build-version');
    if (el && window.HR_BUILD_VERSION && window.HR_BUILD_VERSION !== 'local') {
        el.textContent = window.HR_BUILD_VERSION;
    }
})();
injectArtists();

if (document.querySelector('.ytm-shell')) {
    window.hrPlayer.init();
    renderGlobalAlbumGrid();
}

// =========================================================================
// DYNAMIC CDN BUILD MISMATCH DETECTION & UPDATE NOTIFICATION SYSTEM
// =========================================================================
(function initUpdateChecker() {
    if (!window.HR_BUILD_VERSION ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]' ||
        window.location.hostname.match(/^192\.168\./) ||
        window.HR_BUILD_VERSION === 'local') {
        return;
    }

    var lastCheckTime = Date.now();

    async function checkForUpdates() {
        try {
            var res = await fetch('https://raw.githubusercontent.com/Moonfire-dreamwalkers/horrorcore-reshare-public-assets/main/build-version.json?t=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return;

            var data = await res.json();
            if (data && data.version) {
                var currentVersion = window.HR_BUILD_VERSION || localStorage.getItem('hr_active_build_version') || 'main';
                if (currentVersion !== 'main' && data.version !== currentVersion) {
                    showUpdateNotification(data.version);
                }
            }
        } catch (err) {
            console.warn('Failed to fetch latest build version for update check:', err);
        }
    }

    function showUpdateNotification(newVersion) {
        if (document.getElementById('hr-update-toast')) return;

        var toast = document.createElement('div');
        toast.id = 'hr-update-toast';
        toast.style.cssText = '\n            position: fixed;\n            bottom: 90px;\n            left: 50%;\n            transform: translateX(-50%) translateY(100px);\n            background: rgba(15, 10, 10, 0.85);\n            border: 1px solid rgba(255, 0, 60, 0.45);\n            border-radius: 8px;\n            padding: 12px 20px;\n            display: flex;\n            align-items: center;\n            gap: 15px;\n            z-index: 99999;\n            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.9), 0 0 15px rgba(255, 0, 60, 0.25);\n            transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;\n            opacity: 0;\n            font-family: \'Share Tech Mono\', monospace;\n        ';

        var icon = document.createElement('span');
        icon.innerHTML = '\u26a1';
        icon.style.cssText = '\n            font-size: 1.2rem;\n            animation: hr-pulse-glow 1.5s infinite alternate;\n        ';

        var text = document.createElement('span');
        text.textContent = 'New music curation updates are live!';
        text.style.cssText = '\n            color: #fff;\n            font-size: 0.9rem;\n            letter-spacing: 0.5px;\n            white-space: nowrap;\n        ';

        var btn = document.createElement('button');
        btn.textContent = 'UPDATE NOW';
        btn.style.cssText = '\n            background: #ff003c;\n            color: #fff;\n            border: none;\n            padding: 6px 12px;\n            border-radius: 4px;\n            font-family: \'Orbitron\', sans-serif;\n            font-size: 0.75rem;\n            font-weight: bold;\n            letter-spacing: 1px;\n            cursor: pointer;\n            transition: all 0.2s ease;\n            box-shadow: 0 0 10px rgba(255, 0, 60, 0.5);\n        ';

        btn.onmouseover = function () {
            btn.style.background = '#ff3366';
            btn.style.boxShadow = '0 0 15px rgba(255, 0, 60, 0.8)';
            btn.style.transform = 'scale(1.05)';
        };
        btn.onmouseout = function () {
            btn.style.background = '#ff003c';
            btn.style.boxShadow = '0 0 10px rgba(255, 0, 60, 0.5)';
            btn.style.transform = 'scale(1)';
        };

        btn.onclick = async function () {
            btn.disabled = true;
            btn.textContent = 'UPDATING...';
            try {
                if ('caches' in window) {
                    var keys = await caches.keys();
                    await Promise.all(keys.map(function (key) { return caches.delete(key); }));
                }
                localStorage.setItem('hr_active_build_version', newVersion);
                if ('serviceWorker' in navigator) {
                    var regs = await navigator.serviceWorker.getRegistrations();
                    for (var _i = 0, _a = regs; _i < _a.length; _i++) {
                        var r = _a[_i];
                        await r.update();
                    }
                }
                window.location.reload(true);
            } catch (e) {
                console.error('Failed to clear cache on button click:', e);
                window.location.reload(true);
            }
        };

        toast.appendChild(icon);
        toast.appendChild(text);
        toast.appendChild(btn);
        document.body.appendChild(toast);

        if (!document.getElementById('hr-update-animations')) {
            var styleSheet = document.createElement('style');
            styleSheet.id = 'hr-update-animations';
            styleSheet.textContent = '\n                @keyframes hr-pulse-glow {\n                    from { text-shadow: 0 0 2px rgba(255, 0, 60, 0.5); transform: scale(1); }\n                    to { text-shadow: 0 0 10px rgba(255, 0, 60, 0.9), 0 0 20px rgba(255, 0, 60, 0.6); transform: scale(1.1); }\n                }\n            ';
            document.head.appendChild(styleSheet);
        }

        requestAnimationFrame(function () {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });
    }

    setTimeout(checkForUpdates, 5000);

    setInterval(checkForUpdates, 300000);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            var now = Date.now();
            if (now - lastCheckTime >= 60000) {
                lastCheckTime = now;
                checkForUpdates();
            }
        }
    });
})();

// =========================================================================
// DIAGNOSTIC LOGGING
// =========================================================================
(function logDiagnostics() {
    var scriptEl = document.currentScript;
    var srcUrl = scriptEl ? scriptEl.src : 'unknown (inline)';
    var isCDN = srcUrl.includes('jsdelivr.net');
    var isLocal = srcUrl.includes(window.location.hostname) || srcUrl.startsWith('/') || srcUrl.startsWith('.');

    var diag = {
        timestamp: new Date().toISOString(),
        pageUrl: window.location.href,
        scriptSource: srcUrl,
        loadedFromCDN: isCDN,
        loadedLocally: isLocal,
        appVersion: APP_VERSION,
        swVersion: 'horrorcore-reshare-v11',
        dataJsCDN: typeof HR_BUILD_VERSION !== 'undefined' ? HR_BUILD_VERSION : 'NOT LOADED',
        userAgent: navigator.userAgent.substring(0, 80),
        viewport: window.innerWidth + 'x' + window.innerHeight
    };

    console.log('%c\uD83D\uDD0D HR DIAGNOSTICS %c' + JSON.stringify(diag, null, 2),
        'color: #ff0033; font-weight: bold; font-size: 14px;',
        'color: #aaa;');
    console.log('%c\uD83D\uDCE1 Loaded from: %c' + (isCDN ? '\u2705 jsDelivr CDN' : isLocal ? '\u26A0\uFE0F Local/Vercel' : '\u2753 Unknown'),
        'color: #ffcc00; font-weight: bold;', 'color: #fff;');
    console.log('%c\uD83C\uDFF7  Version: %c' + APP_VERSION + ' %c| %cSW: %cv11',
        'color: #ffcc00;', 'color: #0f0;', 'color: #aaa;', 'color: #ffcc00;', 'color: #0f0;');
    console.log("Horrorcore Reshare logic initialized.");
})();