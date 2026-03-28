const nodemailer = require('nodemailer');

// Cấu hình Mailtrap
const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
        user: "8c8b55a2b74e6f", // Lấy trong mục Integrations -> Nodemailer của Mailtrap
        pass: "05573a6f03746f"  // Lấy trong mục Integrations -> Nodemailer của Mailtrap
    }
});

module.exports = {
    sendPasswordEmail: async function (email, username, password) {
        try {
            let info = await transporter.sendMail({
                from: '"Admin" <admin@hutech.edu.vn>', // Email gửi đi ảo
                to: email, // Gửi đến email đọc từ file
                subject: "Thông tin tài khoản đăng nhập hệ thống",
                html: `
                    <h3>Chào ${username},</h3>
                    <p>Tài khoản của bạn đã được tạo thành công trên hệ thống.</p>
                    <p>Mật khẩu đăng nhập gồm 16 ký tự của bạn là: <b>${password}</b></p>
                    <p>Vui lòng đăng nhập và đổi mật khẩu sớm nhất có thể.</p>
                `
            });
            return info;
        } catch (error) {
            console.error("Lỗi gửi mail: ", error);
        }
    }
};