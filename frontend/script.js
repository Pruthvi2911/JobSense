document.addEventListener('DOMContentLoaded', () => {
    const backendUrl = 'http://localhost:3000/api/v1';
    
    // Status element for automatic job fetch
    const autoJobFetchStatusEl = document.getElementById('autoJobFetchStatus');
    const statusSpinnerEl = autoJobFetchStatusEl ? autoJobFetchStatusEl.querySelector('.spinner') : null;
    const statusTextEl = autoJobFetchStatusEl ? autoJobFetchStatusEl.querySelector('.status-text') : null;

    // Resume related elements
    const resumeUploadForm = document.getElementById('resumeUploadForm');
    const resumeFileEl = document.getElementById('resumeFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const resumeProcessStatusEl = document.getElementById('resumeProcessStatus');
    const parsedResumeDetailsEl = document.getElementById('parsedResumeDetails');
    const parsedResumeTextEl = document.getElementById('parsedResumeText');
    
    // Matching related elements
    const matchingSectionEl = document.getElementById('matching-section');
    const matchJobsBtn = document.getElementById('matchJobsBtn');
    const matchingStatusEl = document.getElementById('matchingStatus');
    const filterTagsEl = document.getElementById('filterTags');
    const filterPostedAfterEl = document.getElementById('filterPostedAfter');

    // Job results elements
    const jobResultsEl = document.getElementById('jobResults');
    const jobResultsPlaceholder = jobResultsEl ? jobResultsEl.querySelector('.placeholder-text') : null;
    
    const themeToggleButton = document.getElementById('theme-toggle');
    let currentResumeId = null;

    // --- Escape text before putting it into innerHTML (job text and LLM output are untrusted) ---
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const safeUrl = (url) => (/^https?:\/\//i.test(url || '') ? url : '#');

    // --- Helper to update auto fetch status with spinner ---
    function updateAutoFetchStatus(text, showSpinner = false) {
        if (statusTextEl) statusTextEl.textContent = text;
        if (statusSpinnerEl) statusSpinnerEl.style.display = showSpinner ? 'inline-block' : 'none';
    }

    // --- Helper to toggle button busy state ---
    const setButtonBusy = (button, isBusy) => {
        if (button) {
            button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
            button.disabled = isBusy;
        }
    };

    // --- Theme Toggle Functionality ---
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme) {
        document.body.setAttribute('data-theme', currentTheme);
        if (themeToggleButton) themeToggleButton.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    }
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => {
            let theme = document.body.getAttribute('data-theme');
            if (theme === 'dark') {
                document.body.removeAttribute('data-theme');
                localStorage.removeItem('theme');
                themeToggleButton.textContent = '🌙';
            } else {
                document.body.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggleButton.textContent = '☀️';
            }
        });
    }
    
    // --- Function to trigger background job update (API scrape) ---
    async function triggerInitialJobDataUpdate() {
        updateAutoFetchStatus('Updating job listings...', true); // Show "Updating..." with spinner
        let finalStatusMessage = 'Job listings updated successfully.'; // Optimistic default
        let updateError = false;

        try {
            const response = await fetch(`${backendUrl}/jobs/scrape`, { method: 'POST' });
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data && Array.isArray(result.data) && result.data.length > 0 && result.data[0]) {
                    const item = result.data[0];
                    if (item.status === 'success' || item.status === 'success_mocked') {
                        // Log details for dev, but keep UI message simple
                        console.log(`Job Update Details: Source records: ${item.jobsFound}, Added: ${item.jobsAdded}, Existed: ${item.jobsAlreadyExisted}, Index Failed: ${item.jobsFailedToIndex}`);
                    } else if (item.error) {
                        finalStatusMessage = `Job update issue: ${item.error}`;
                        updateError = true;
                    }
                } else if (!result.success && result.message) {
                     finalStatusMessage = `Job update issue: ${result.message}`;
                     updateError = true;
                }
            } else {
                finalStatusMessage = `Job data update failed: Server responded with ${response.status}.`;
                updateError = true;
            }
        } catch (error) {
            finalStatusMessage = `Failed to update job listings: ${error.message}`;
            console.error('Initial Job Data Update Error:', error);
            updateError = true;
        }
        updateAutoFetchStatus(finalStatusMessage, false); // Update to final message and hide spinner
        if(updateError && jobResultsPlaceholder) {
            jobResultsPlaceholder.textContent = "Could not update job listings. Please ensure backend services are running and try refreshing."
        }
    }

    // --- Function to handle initial page load ---
    async function initializePage() {
        updateAutoFetchStatus('Initializing JobSense...', false); // No spinner initially
        if (jobResultsPlaceholder) {
            jobResultsPlaceholder.textContent = 'Upload a resume and click "Match Jobs" to see results.';
            jobResultsPlaceholder.style.display = 'block';
        }
        jobResultsEl.innerHTML = ''; // Clear any job cards
        jobResultsEl.appendChild(jobResultsPlaceholder); // Ensure placeholder is the only content

        // Trigger the job data update in the background.
        // This will show "Updating..." and then "Job listings updated successfully."
        await triggerInitialJobDataUpdate(); 
    }

    // --- Resume Upload Logic ---
    if (resumeUploadForm) {
        resumeUploadForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!resumeFileEl.files || resumeFileEl.files.length === 0) {
                resumeProcessStatusEl.textContent = 'Please select a PDF file.';
                return;
            }
            const formData = new FormData();
            formData.append('resumeFile', resumeFileEl.files[0]);
            resumeProcessStatusEl.textContent = 'Uploading and processing resume...';
            setButtonBusy(uploadBtn, true);
            parsedResumeDetailsEl.style.display = 'none';
            
            // Clear previous match results and show placeholder
            if (jobResultsPlaceholder) {
                jobResultsPlaceholder.textContent = 'Upload a resume and click "Match Jobs" to see results.';
                jobResultsPlaceholder.style.display = 'block';
            }
            jobResultsEl.innerHTML = ''; 
            jobResultsEl.appendChild(jobResultsPlaceholder);
            matchingSectionEl.style.display = 'none';


            try {
                const response = await fetch(`${backendUrl}/resume/upload`, { method: 'POST', body: formData });
                const result = await response.json();
                if (result.success && result.data) {
                    let statusMsg = `Resume processed: ${result.data.originalFilename}. `;
                    if (result.data.parsedText && result.data.parsedText.trim()) {
                        statusMsg += 'Text extracted. ';
                        parsedResumeTextEl.textContent = result.data.parsedText;
                        parsedResumeDetailsEl.style.display = 'block';
                    } else {
                        statusMsg += 'Warning: No text extracted. ';
                        parsedResumeTextEl.textContent = 'No text content found in PDF.';
                        parsedResumeDetailsEl.style.display = 'block';
                    }
                    // Match is enabled once the text is parsed and the resume is saved
                    currentResumeId = result.data.resumeId;
                    if (currentResumeId) {
                        matchingSectionEl.style.display = 'block';
                        matchJobsBtn.disabled = false;
                        statusMsg += 'Ready to match.';
                        matchingStatusEl.textContent = ''; // Clear previous matching status
                    } else {
                        statusMsg += 'Nothing to match on.';
                        matchingSectionEl.style.display = 'none';
                    }
                    resumeProcessStatusEl.textContent = statusMsg;
                } else {
                    resumeProcessStatusEl.textContent = `Error: ${result.message || 'Failed to process resume.'}`;
                    currentResumeId = null;
                }
            } catch (error) {
                resumeProcessStatusEl.textContent = 'Upload failed. Check console.';
                currentResumeId = null;
                console.error('Resume Upload Error:', error);
            }
            setButtonBusy(uploadBtn, false);
        });
    }

    // --- Match Jobs Logic ---
    if (matchJobsBtn) {
        matchJobsBtn.addEventListener('click', async () => {
            if (!currentResumeId) {
                matchingStatusEl.textContent = 'Please upload and process a resume first.';
                return;
            }
            const filters = {};
            const tags = filterTagsEl.value.split(',').map((t) => t.trim()).filter(Boolean);
            if (tags.length) filters.tags = tags;
            if (filterPostedAfterEl.value) filters.postedAfter = filterPostedAfterEl.value; // "YYYY-MM-DD"

            matchingStatusEl.textContent = 'Finding matching jobs and writing explanations...';
            if (jobResultsPlaceholder) jobResultsPlaceholder.style.display = 'none';
            jobResultsEl.innerHTML = ''; 
            setButtonBusy(matchJobsBtn, true);

            try {
                const response = await fetch(`${backendUrl}/match/jobs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ resumeId: currentResumeId, filters }),
                });
                const result = await response.json();
                if (result.success && result.data) {
                    if (result.data.length > 0) {
                        matchingStatusEl.textContent = `Found ${result.data.length} matched jobs.` +
                            (result.llmStatus === 'ok' ? '' : ' (Some or all explanations are unavailable right now.)');
                        displayJobResults(result.data); // This function will handle the placeholder internally
                    } else {
                        matchingStatusEl.textContent = 'No matching jobs found based on your resume.';
                        displayJobResults([]); // Call with empty array to show placeholder
                    }
                } else {
                    matchingStatusEl.textContent = `Matching error: ${result.message || 'Failed to find matches.'}`;
                    displayJobResults([]); // Show placeholder on error too
                }
            } catch (error) {
                matchingStatusEl.textContent = 'Matching request failed. Check console.';
                console.error('Match Jobs Error:', error);
                displayJobResults([]); // Show placeholder on error
            }
            setButtonBusy(matchJobsBtn, false);
        });
    }

    // --- Function to display job results ---
    function displayJobResults(jobs) {
        jobResultsEl.innerHTML = ''; // Clear everything, including any old placeholder

        if (!jobs || jobs.length === 0) {
            // Create and append the placeholder if no jobs
            const p = document.createElement('p');
            p.className = 'placeholder-text';
            p.textContent = jobResultsPlaceholder ? jobResultsPlaceholder.textContent : 'No jobs to display.'; // Use original placeholder text or default
            if(matchingStatusEl.textContent.includes("No matching jobs found")) { // More specific message if it was a match attempt
                p.textContent = "No matching jobs found for this resume.";
            }
            jobResultsEl.appendChild(p);
            return;
        }

         jobs.forEach(job => {
            const jobCard = document.createElement('article');
            jobCard.className = 'job-card-custom'; 
            
            const title = escapeHtml(job.title || 'N/A');
            const company = escapeHtml(job.company || 'N/A');
            const location = escapeHtml(job.location || 'N/A');
            const url = escapeHtml(safeUrl(job.url));
            const similarityText = typeof job.similarity === 'number' ? `<mark>${(job.similarity * 100).toFixed(1)}%</mark>` : '';
            const explanation = job.fit_explanation
                ? escapeHtml(job.fit_explanation)
                : '<em>Explanation unavailable right now.</em>';
            const missing = (job.missing_skills || []).map(escapeHtml).join(', ');
            const tags = (job.tags || []).slice(0, 8).map(escapeHtml).join(', ');

            jobCard.innerHTML = `
                <header><h3>${title}</h3></header>
                <p><strong>Company:</strong> ${company}</p>
                <p><strong>Location:</strong> ${location}</p>
                ${similarityText ? `<p><strong>Similarity: ${similarityText}</strong></p>` : ''}
                <p><strong>Why it fits:</strong> ${explanation}</p>
                ${missing ? `<p><strong>Missing skills:</strong> ${missing}</p>` : ''}
                ${tags ? `<details><summary>Tags</summary><p>${tags}</p></details>` : ''}
                <footer style="margin-top: auto; padding-top: 1rem; border-top: 1px solid #e9ecef;"><a href="${url}" target="_blank" rel="noopener noreferrer" role="button" class="outline">View Job Listing</a></footer>
            `;
            jobResultsEl.appendChild(jobCard);
        });
    }

    // --- Initialize Page ---
    initializePage();
});