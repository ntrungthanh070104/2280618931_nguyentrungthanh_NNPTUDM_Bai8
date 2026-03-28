const exceljs = require('exceljs');

async function createExcelFile() {
    // Tạo một workbook và worksheet mới
    let workbook = new exceljs.Workbook();
    let worksheet = workbook.addWorksheet('Users');

    // Tạo dòng tiêu đề (Dòng 1)
    worksheet.addRow(['username', 'email']);

    // Vòng lặp tự động tạo 99 user
    for (let i = 1; i <= 99; i++) {
        // Thêm số 0 đằng trước nếu i < 10 (ví dụ: 01, 02...)
        let num = i < 10 ? `0${i}` : `${i}`; 
        worksheet.addRow([`user${num}`, `user${num}@haha.com`]);
    }

    // Lưu file ra ổ cứng
    await workbook.xlsx.writeFile('users_import_chuan.xlsx');
    console.log('Đã tạo file users_import_chuan.xlsx thành công!');
}

createExcelFile();