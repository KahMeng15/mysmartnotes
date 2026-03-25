/**
 * Global Footer Injection System
 * Fetches footer text from system settings and injects it into the page-card
 */

async function injectGlobalFooter() {
    try {
        // Find the page-card element
        const pageCard = document.querySelector('.page-card');
        if (!pageCard) return; // No page-card on this page, skip

        // Fetch public settings to get footer text
        const response = await fetch('/auth/public-settings');
        if (!response.ok) return;

        const settings = await response.json();
        const footerText = settings.footer_text?.trim();

        // Only inject if footer text is set
        if (!footerText) return;

        // Check if footer already exists (to prevent duplicates)
        if (document.getElementById('global-footer')) return;

        // Create footer element
        const footer = document.createElement('div');
        footer.id = 'global-footer';
        footer.className = 'global-footer';
        footer.textContent = footerText;

        // Append footer to body (fixed position at bottom of page)
        document.body.appendChild(footer);
    } catch (e) {
        console.error('Error injecting global footer:', e);
    }
}

// Inject footer when DOM is ready
document.addEventListener('DOMContentLoaded', injectGlobalFooter);

// Also run immediately if DOM is already loaded
if (document.readyState !== 'loading') {
    injectGlobalFooter();
}
