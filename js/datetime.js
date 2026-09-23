const datetimeElement = document.getElementById('Datetime');

function updateDateTime() {
    const date = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = date.toLocaleDateString('vi-VN', options);
    const formattedTime = date.toLocaleTimeString('vi-VN');
    datetimeElement.textContent = `${formattedDate} ${formattedTime}`;
}

// Cập nhật thời gian mỗi giây
setInterval(updateDateTime, 1000);

// Cập nhật thời gian khi trang web được tải
updateDateTime();