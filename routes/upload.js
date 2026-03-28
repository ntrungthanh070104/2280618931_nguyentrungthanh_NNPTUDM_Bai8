var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let path = require('path')
let exceljs = require('exceljs')
let categoryModel = require('../schemas/categories')
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let mongoose = require('mongoose')
let slugify = require('slugify')

// --- CÁC MODULE CHO CHỨC NĂNG IMPORT USER ---
const crypto = require('crypto');
const roleModel = require('../schemas/roles');
const userController = require('../controllers/users');
const mailHandler = require('../utils/mailHandler');
// ----------------------------------------------

router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(pathFile)
})

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})

router.post('/multiple_file', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})

router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workbook.xlsx.readFile(pathFile);
    let worksheet = workbook.worksheets[0];
    let categories = await categoryModel.find({});
    let categoryMap = new Map()
    for (const category of categories) {
        categoryMap.set(category.name, category._id)
    }
    let products = await productModel.find({});
    let getTitle = products.map(p => p.title)
    let getSku = products.map(p => p.sku)
    let result = [];
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let errorsInRow = [];
        const contentRow = worksheet.getRow(row);
        let sku = contentRow.getCell(1).value;
        let title = contentRow.getCell(2).value;
        let category = contentRow.getCell(3).value;
        let price = Number.parseInt(contentRow.getCell(4).value);
        let stock = Number.parseInt(contentRow.getCell(5).value);
        if (price < 0 || isNaN(price)) {
            errorsInRow.push("price pahi la so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            errorsInRow.push("stock pahi la so duong")
        }
        if (!categoryMap.has(category)) {
            errorsInRow.push("category khong hop le")
        }
        if (getTitle.includes(title)) {
            errorsInRow.push("Title da ton tai")
        }
        if (getSku.includes(sku)) {
            errorsInRow.push("sku da ton tai")
        }
        if (errorsInRow.length > 0) {
            result.push(errorsInRow)
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newProduct = new productModel({
                sku: sku,
                title: title,
                slug: slugify(title,
                    {
                        replacement: '-',
                        remove: undefined,
                        lower: true,
                        trim: true
                    }
                ), price: price,
                description: title,
                category: categoryMap.get(category)
            })
            await newProduct.save({ session });

            let newInventory = new inventoryModel({
                product: newProduct._id,
                stock: stock
            })
            await newInventory.save({ session });
            await newInventory.populate('product')
            await session.commitTransaction()
            await session.endSession()
            getTitle.push(newProduct.title)
            getSku.push(newProduct.sku)
            result.push(newInventory)
        } catch (error) {
            await session.abortTransaction()
            await session.endSession()
            result.push(error.message) 
        }

    }
    res.send(result)
})

// --- API: IMPORT USER TỪ EXCEL VÀ GỬI MAIL (ĐÃ GỠ TRANSACTION CHO DATABASE LOCAL) ---
router.post('/import_users', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        return res.status(400).send({ message: "Vui lòng đính kèm file excel" });
    }

    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename);
    
    try {
        await workbook.xlsx.readFile(pathFile);
        let worksheet = workbook.worksheets[0];
        
        let roleUser = await roleModel.findOne({ name: 'user' });
        if (!roleUser) {
            return res.status(400).send({ message: "Không tìm thấy role 'user' trong database" });
        }

        let result = [];
        let errors = [];

        // Duyệt từ dòng 2 (bỏ qua dòng tiêu đề)
        for (let row = 2; row <= worksheet.rowCount; row++) {
            const contentRow = worksheet.getRow(row);
            let rawUsername = contentRow.getCell(1).value;
            let rawEmail = contentRow.getCell(2).value;

            if (!rawUsername || !rawEmail) continue;

            let username = typeof rawUsername === 'object' ? (rawUsername.text || rawUsername.hyperlink) : rawUsername.toString().trim();
            let email = typeof rawEmail === 'object' ? (rawEmail.text || rawEmail.hyperlink) : rawEmail.toString().trim();
            
            if (email.startsWith('mailto:')) {
                email = email.replace('mailto:', '');
            }

            let existUser = await userController.GetAnUserByUsername(username);
            let existEmail = await userController.GetAnUserByEmail(email);
            
            if (existUser || existEmail) {
                errors.push(`Dòng ${row}: Username (${username}) hoặc Email (${email}) đã tồn tại`);
                continue; 
            }

            try {
                let randomPassword = crypto.randomBytes(8).toString('hex'); 

                // Tạo user mới, bỏ qua session để không bị lỗi Transaction
                await userController.CreateAnUser(
                    username, 
                    randomPassword, 
                    email, 
                    roleUser._id, 
                    undefined,      // Truyền undefined vào vị trí của session
                    username,       
                    "",             
                    true,           // Trạng thái active = true
                    0               
                );

                await mailHandler.sendPasswordEmail(email, username, randomPassword);
                result.push({ username: username, email: email, status: "Thành công" });
            } catch (error) {
                errors.push(`Dòng ${row}: Lỗi tạo user - ${error.message}`);
            }
        }

        res.status(200).send({ 
            message: "Hoàn tất xử lý file Excel", 
            successCount: result.length, 
            errorCount: errors.length,
            errors: errors,
            data: result 
        });

    } catch (err) {
        res.status(500).send({ message: "Không thể đọc file excel", error: err.message });
    }
});

module.exports = router;