const API_BASE_URL = 'http://localhost:8000';
const BLOB_BRIDGE_URL = 'http://localhost:3001'; // Адреса Node.js мосту для Vercel Blob
const ITEMS_PER_PAGE = 12;

let currentPage = 0;
let currentVideoId = null;
let videoData = [];

let uploadForm, uploadButton, videoFileInput, selectedFileName, uploadDropzone;
let uploadProgressContainer, uploadProgressBar, uploadStatus;
let videoCarousel, carouselSkeleton, statusFilter, refreshGallery, pagination, totalVideosCount;
let deleteVideoBtn, featuredVideoPlayer, featuredVideoTitle, featuredVideoInfo;
let featuredVideoMetadata, featuredVideoDuration, featuredVideoDate;
let carouselPrevBtn, carouselNextBtn;

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');

    initDomElements();

    setupEventListeners();

    loadVideos();
});

function initDomElements() {
    uploadForm = document.getElementById('uploadForm');
    uploadButton = document.getElementById('uploadButton');
    videoFileInput = document.getElementById('videoFile');
    selectedFileName = document.getElementById('selectedFileName');
    uploadDropzone = document.getElementById('uploadDropzone');
    uploadProgressContainer = document.getElementById('uploadProgressContainer');
    uploadProgressBar = document.getElementById('uploadProgressBar');
    uploadStatus = document.getElementById('uploadStatus');

    videoCarousel = document.getElementById('videoCarousel');
    carouselSkeleton = document.getElementById('carouselSkeleton');
    statusFilter = document.getElementById('statusFilter');
    refreshGallery = document.getElementById('refreshGallery');
    pagination = document.getElementById('pagination');
    totalVideosCount = document.getElementById('totalVideosCount');

    deleteVideoBtn = document.getElementById('deleteVideoBtn');
    featuredVideoPlayer = document.getElementById('featuredVideoPlayer');
    featuredVideoTitle = document.getElementById('featuredVideoTitle');
    featuredVideoInfo = document.getElementById('featuredVideoInfo');
    featuredVideoMetadata = document.getElementById('featuredVideoMetadata');
    featuredVideoDuration = document.getElementById('featuredVideoDuration');
    featuredVideoDate = document.getElementById('featuredVideoDate');

    carouselPrevBtn = document.getElementById('carouselPrevBtn');
    carouselNextBtn = document.getElementById('carouselNextBtn');

    console.log('DOM elements initialized');
}

function setupEventListeners() {
    if (videoFileInput) {
        videoFileInput.addEventListener('change', handleFileSelection);
    }

    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUpload);
    }

    if (uploadDropzone) {
        setupDragAndDrop();
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            currentPage = 0;
            loadVideos();
        });
    }

    if (refreshGallery) {
        refreshGallery.addEventListener('click', loadVideos);
    }

    if (deleteVideoBtn) {
        deleteVideoBtn.addEventListener('click', () => {
            if (currentVideoId) {
                deleteVideo(currentVideoId);
            }
        });
    }

    setupCarouselNavigation();

    console.log('Event listeners set up');
}

function setupCarouselNavigation() {
    if (carouselPrevBtn) {
        carouselPrevBtn.addEventListener('click', () => {
            scrollCarousel(-1);
        });
    }

    if (carouselNextBtn) {
        carouselNextBtn.addEventListener('click', () => {
            scrollCarousel(1);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            scrollCarousel(-1);
        } else if (e.key === 'ArrowRight') {
            scrollCarousel(1);
        }
    });
}

function handleFileSelection(e) {
    const file = e.target.files[0];
    if (file && selectedFileName) {
        selectedFileName.textContent = file.name;
    } else if (selectedFileName) {
        selectedFileName.textContent = 'No file selected';
    }
}

function setupDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadDropzone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadDropzone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadDropzone.addEventListener(eventName, unhighlight, false);
    });

    uploadDropzone.addEventListener('drop', handleDrop, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        uploadDropzone.classList.add('drag-over');
    }

    function unhighlight() {
        uploadDropzone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('video/')) {
            videoFileInput.files = files;
            handleFileSelection({ target: { files } });
        }
    }
}

async function handleUpload(e) {
    e.preventDefault();

    const title = document.getElementById('videoTitle').value.trim();
    const file = videoFileInput.files[0];

    if (!title) {
        alert('Please enter a video title');
        return;
    }

    if (!file) {
        alert('Please select a video file');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);

    uploadButton.disabled = true;
    uploadProgressContainer.style.display = 'block';
    uploadProgressBar.style.width = '0%';
    uploadStatus.textContent = 'Uploading...';

    try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                uploadProgressBar.style.width = percentComplete + '%';
            }
        });

        const uploadPromise = new Promise((resolve, reject) => {
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (error) {
                        reject(new Error('Invalid response format'));
                    }
                } else {
                    reject(new Error('Upload failed with status ' + xhr.status));
                }
            };

            xhr.onerror = function() {
                reject(new Error('Network error occurred'));
            };
        });

        xhr.open('POST', `${BLOB_BRIDGE_URL}/upload`, true);


        xhr.send(formData);

        const data = await uploadPromise;

        uploadProgressBar.style.width = '100%';
        uploadStatus.textContent = 'Upload complete! Processing video...';



        setTimeout(() => {
            uploadForm.reset();
            selectedFileName.textContent = 'No file selected';
            uploadButton.disabled = false;
            uploadProgressContainer.style.display = 'none';
            loadVideos();

        }, 2000);

    } catch (error) {
        console.error('Upload error:', error);
        uploadStatus.textContent = `Error: ${error.message}`;
        uploadProgressBar.classList.add('bg-danger');

        setTimeout(() => {
            uploadButton.disabled = false;
            uploadProgressBar.classList.remove('bg-danger');
        }, 3000);
    }
}

async function pollProcessingStatus(videoId) {
    let attempts = 0;
    const maxAttempts = 30; // ~5 minutes with 10s interval
    const interval = 10000; // 10 seconds

    const checkStatus = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/videos/${videoId}/status`);

            if (!response.ok) {
                throw new Error('Failed to get processing status');
            }

            const data = await response.json();

            if (data.job_status === 'completed') {
                console.log('Video processing completed');
                loadVideos(); // Refresh the gallery
                return;
            } else if (data.job_status === 'failed') {
                console.error('Video processing failed:', data.error_message);
                return;
            }

            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(checkStatus, interval);
            }
        } catch (error) {
            console.error('Status polling error:', error);
        }
    };

    setTimeout(checkStatus, interval);
}

async function loadVideos() {
    if (carouselSkeleton) {
        carouselSkeleton.style.display = 'block';
    }

    if (videoCarousel) {
        videoCarousel.style.display = 'none';
    }

    try {
        const status = statusFilter ? statusFilter.value : '';
        const skip = currentPage * ITEMS_PER_PAGE;

        let url = `${API_BASE_URL}/videos?skip=${skip}&limit=${ITEMS_PER_PAGE}`;
        if (status) {
            url += `&status=${status}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Failed to load videos');
        }

        const data = await response.json();
        videoData = data.videos || []; // Store video data globally

        console.log('Fetched videos:', videoData.length);

        renderVideoGrid(videoData);
        updatePagination(data.total || 0);
        updateTotalCount(data.total || 0);

        if (videoData.length > 0 && !currentVideoId && featuredVideoPlayer) {
            playVideo(videoData[0].id);
        }

        updateNavButtonsState();

    } catch (error) {
        console.error('Error loading videos:', error);
        if (videoCarousel) {
            videoCarousel.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Failed to load videos: ${error.message}
                </div>
                <button class="btn btn-primary mt-3" onclick="loadVideos()">
                    <i class="fas fa-sync-alt me-2"></i>Try Again
                </button>
            `;
            videoCarousel.style.display = 'block';
        }
    } finally {
        if (carouselSkeleton) {
            carouselSkeleton.style.display = 'none';
        }
    }
}

function renderVideoGrid(videos) {
    if (!videoCarousel) {
        console.error('Video carousel element not found');
        return;
    }

    if (!videos || videos.length === 0) {
        videoCarousel.innerHTML = `
            <div class="text-center py-4">
                <div class="text-muted">
                    <i class="fas fa-film fa-3x mb-3"></i>
                    <h4>No videos found</h4>
                    <p>Upload a video to get started</p>
                </div>
            </div>
        `;
        videoCarousel.style.display = 'block';

        if (carouselPrevBtn) carouselPrevBtn.disabled = true;
        if (carouselNextBtn) carouselNextBtn.disabled = true;

        return;
    }

    const gridHTML = `
        <div class="video-grid">
            ${videos.map(video => createVideoCardHTML(video)).join('')}
        </div>
    `;

    videoCarousel.innerHTML = gridHTML;
    videoCarousel.style.display = 'block';

    document.querySelectorAll('.video-card').forEach(card => {
        card.addEventListener('click', () => {
            const videoId = card.dataset.videoId;
            playVideo(videoId);
        });
    });

    if (carouselPrevBtn) carouselPrevBtn.disabled = false;
    if (carouselNextBtn) carouselNextBtn.disabled = false;
}

function createVideoCardHTML(video) {
    let thumbnailSrc = video.thumbnail_path || '/api/placeholder/300/180';
    let statusBadge = '';

    if (video.status === 'processing') {
        statusBadge = '<span class="status-badge badge bg-warning">Processing</span>';
    } else if (video.status === 'error') {
        statusBadge = '<span class="status-badge badge bg-danger">Error</span>';
    }

    const duration = formatDuration(video.duration || 0);

    return `
        <div class="video-card ${currentVideoId === video.id ? 'active' : ''}" data-video-id="${video.id}">
            <div class="thumbnail-container">
                <img src="${thumbnailSrc}" alt="${video.title}" class="thumbnail">
                ${statusBadge}
                <div class="play-icon">
                    <i class="fas fa-play-circle"></i>
                </div>
                <span class="duration-badge">${duration}</span>
            </div>
            <h5 class="video-title">${video.title}</h5>
        </div>
    `;
}

function scrollCarousel(direction) {
    if (!videoCarousel) return;

    const scrollAmount = direction * 500; // Adjust scroll amount as needed
    videoCarousel.scrollLeft += scrollAmount;

    setTimeout(updateNavButtonsState, 300);
}

function updateNavButtonsState() {
    if (!videoCarousel || !carouselPrevBtn || !carouselNextBtn) return;

    const canScrollLeft = videoCarousel.scrollLeft > 0;

    const canScrollRight =
        videoCarousel.scrollLeft <
        (videoCarousel.scrollWidth - videoCarousel.clientWidth - 10);

    carouselPrevBtn.disabled = !canScrollLeft;
    carouselNextBtn.disabled = !canScrollRight;
}

function playVideo(videoId) {
    if (!featuredVideoPlayer) return;

    const video = videoData.find(v => v.id == videoId);

    if (!video) {
        console.error(`Video with ID ${videoId} not found`);
        return;
    }

    currentVideoId = video.id;

    featuredVideoPlayer.src = video.file_path;
    featuredVideoPlayer.poster = video.thumbnail_path || '/api/placeholder/800/450';
    featuredVideoPlayer.load();

    featuredVideoPlayer.play().catch(e => {
        console.log('Autoplay prevented:', e);
    });

    if (featuredVideoTitle) featuredVideoTitle.textContent = video.title || 'Untitled Video';
    if (featuredVideoInfo) featuredVideoInfo.textContent = `Uploaded: ${formatDate(video.created_at)}`;
    if (featuredVideoDuration) featuredVideoDuration.textContent = formatDuration(video.duration || 0);
    if (featuredVideoDate) featuredVideoDate.textContent = formatDate(video.created_at);
    if (featuredVideoMetadata) featuredVideoMetadata.classList.remove('d-none');

    document.querySelectorAll('.video-card').forEach(card => {
        if (card.dataset.videoId == videoId) {
            card.classList.add('active');
            scrollToActiveVideo(card);
        } else {
            card.classList.remove('active');
        }
    });
}

function scrollToActiveVideo(videoCard) {
    if (!videoCarousel || !videoCard) return;

    const carouselRect = videoCarousel.getBoundingClientRect();
    const cardRect = videoCard.getBoundingClientRect();

    const isVisible =
        cardRect.left >= carouselRect.left &&
        cardRect.right <= carouselRect.right;

    if (!isVisible) {
        const scrollLeft =
            videoCarousel.scrollLeft +
            (cardRect.left - carouselRect.left) -
            (carouselRect.width / 2) +
            (cardRect.width / 2);

        videoCarousel.scrollTo({
            left: scrollLeft,
            behavior: 'smooth'
        });
    }
}

async function deleteVideo(videoId) {
    if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/videos/${videoId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete video');
        }

        if (currentVideoId === videoId) {
            currentVideoId = null;
            if (featuredVideoPlayer) featuredVideoPlayer.src = '';
            if (featuredVideoTitle) featuredVideoTitle.textContent = 'Select a video to play';
            if (featuredVideoInfo) featuredVideoInfo.textContent = 'Choose a video from the carousel below';
            if (featuredVideoMetadata) featuredVideoMetadata.classList.add('d-none');
        }

        loadVideos();

    } catch (error) {
        console.error('Error deleting video:', error);
        alert(`Error: ${error.message}`);
    }
}

function updatePagination(total) {
    if (!pagination) return;

    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let paginationHTML = '';

    paginationHTML += `
        <li class="page-item ${currentPage === 0 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage - 1}" aria-label="Previous">
                <span aria-hidden="true">&laquo;</span>
            </a>
        </li>
    `;

    for (let i = 0; i < totalPages; i++) {
        // Show limited page numbers with ellipsis for large page counts
        if (
            i === 0 || // First page
            i === totalPages - 1 || // Last page
            (i >= currentPage - 1 && i <= currentPage + 1) // Pages around current
        ) {
            paginationHTML += `
                <li class="page-item ${i === currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i + 1}</a>
                </li>
            `;
        } else if (
            i === currentPage - 2 ||
            i === currentPage + 2
        ) {
            paginationHTML += `
                <li class="page-item disabled">
                    <a class="page-link" href="#">&hellip;</a>
                </li>
            `;
        }
    }

    paginationHTML += `
        <li class="page-item ${currentPage >= totalPages - 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}" aria-label="Next">
                <span aria-hidden="true">&raquo;</span>
            </a>
        </li>
    `;

    pagination.innerHTML = paginationHTML;

    document.querySelectorAll('.page-link[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = parseInt(e.target.closest('.page-link').dataset.page);
            if (page >= 0 && page < totalPages) {
                currentPage = page;
                loadVideos();

                // Scroll to gallery top
                const videoSection = document.querySelector('.video-player-section');
                if (videoSection) {
                    videoSection.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });
}

function updateTotalCount(total) {
    if (!totalVideosCount) return;
    totalVideosCount.textContent = `Showing ${Math.min(ITEMS_PER_PAGE, total)} of ${total} video${total !== 1 ? 's' : ''}`;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDuration(seconds) {
    if (!seconds) return '00:00';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

window.addEventListener('load', function() {
    if (videoCarousel) {
        videoCarousel.addEventListener('scroll', updateNavButtonsState);

        setTimeout(updateNavButtonsState, 500);
    }
});