document.addEventListener('DOMContentLoaded', () => {
  updateTable();
  document.getElementById('resetButton').addEventListener('click', resetData);
  document.getElementById('exportButton').addEventListener('click', exportCSV);
});

function updateTable() {
  chrome.storage.local.get(['timeEntries'], result => {
    const timeEntries = result.timeEntries || [];
    const table = document.getElementById('timeTable');
    
    // Clear existing rows
    while(table.rows.length > 1) {
      table.deleteRow(1);
    }
    
    // Get the 10 most recent entries
    const recentEntries = timeEntries.slice(-10).reverse();
    
    recentEntries.forEach(entry => {
      const row = table.insertRow(-1);
      const timestampCell = row.insertCell(0);
      const websiteCell = row.insertCell(1);
      const durationCell = row.insertCell(2);
      
      // Format the timestamp
      const date = new Date(entry.timestamp);
      timestampCell.textContent = date.toLocaleString();
      
      websiteCell.textContent = entry.website;
      durationCell.textContent = entry.duration;
    });
  });
}

function resetData() {
  if (confirm('Are you sure you want to reset all data? This action cannot be undone.')) {
    chrome.storage.local.set({ timeEntries: [] }, () => {
      updateTable();
      alert('All data has been reset.');
    });
  }
}

function exportCSV() {
  chrome.storage.local.get(['timeEntries'], result => {
    const timeEntries = result.timeEntries || [];
    
    if (timeEntries.length === 0) {
      alert('No data to export.');
      return;
    }
    
    const csvContent = [
      ['Timestamp', 'Website', 'Duration (minutes)', 'Close Time'],
      ...timeEntries.map(entry => [entry.timestamp, entry.website, entry.duration, entry.closeTime])
    ].map(e => e.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'website_time_tracker_data.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}