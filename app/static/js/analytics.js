const API_URL = '';

window.addEventListener('load', () => {
    initializeCharts();
});

function initializeCharts() {
    // Study Time Chart
    const studyCtx = document.getElementById('studyTimeChart').getContext('2d');
    new Chart(studyCtx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Study Hours',
                data: [2, 2.5, 1.8, 3, 2.2, 1.5, 0],
                borderColor: '#593C8F',
                backgroundColor: 'rgba(78, 205, 196, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#999' }
                },
                x: {
                    ticks: { color: '#999' }
                }
            }
        }
    });

    // Quiz Performance Chart
    const quizCtx = document.getElementById('quizChart').getContext('2d');
    new Chart(quizCtx, {
        type: 'bar',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Average Score (%)',
                data: [82, 88, 92, 95],
                backgroundColor: '#FF6B6B'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: '#999' }
                },
                x: {
                    ticks: { color: '#999' }
                }
            }
        }
    });
}

function filterBy(period) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    // Reload analytics for selected period
}

function exportPDF() {
    alert('Export to PDF coming soon');
}

function shareProgress() {
    alert('Share progress feature coming soon');
}

function logout() {
    window.logout();
}
