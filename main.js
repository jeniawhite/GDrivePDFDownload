const drive = require('./drive');
const env = require('dotenv').config();
const fs = require('fs');
const path = require('path');
const r_folder = `./${process.env.DEST}`;

(async () => {
    deleteFolderRecursive(r_folder);
    fs.mkdirSync(r_folder);
    await drive.init();
    const subjects = await drive.listFiles({
        folder: process.env.ROOT_FOLDER,
        recursive: false
    });
    console.log('SUBJECTS:', subjects.FOLDER);
    return Promise.all(subjects.FOLDER.map(async s => {
        const classes = await drive.listFiles({
            folder: s.id,
            match: RegExp(`([0-9]-[0-9]) *`)
        });
        console.log('CLASSES:', classes.FOLDER);
        return Promise.all(classes.FOLDER.map(async c => {
            const teachers = await drive.listFiles({
                folder: c.id,
                match: RegExp(`${process.env.YEARS}_*`)
            });
            console.log('TEACHERS:', teachers.FOLDER);
            return Promise.all(teachers.FOLDER.map(async t => {
                const lesson = await drive.listFiles({
                    folder: t.id,
                    match: RegExp(`(${process.env.DATE})`)
                });
                if (!lesson.FOLDER.length) return;
                console.log('LESSON:', lesson.FOLDER[0]);
                const pdf = await drive.listFiles({
                    folder: lesson.FOLDER[0].id,
                    // TODO: Once all file will follow convention use - RegExp(`[0-9][0-9][.]ДЗ[_]*`)
                    match: RegExp(`[0-9][0-9][\._]ДЗ[\.|_]*`)
                });
                if (pdf.PDF.length) {
                    console.log('PDF:', pdf.PDF[0]);
                    const f_name = pdf.PDF[0].name;
                    const cut = f_name.split('_')[2];
                    const dest_folder = cut.replace(new RegExp('[0-9]'), '').replace(' ', '');
                    await drive.getFile({
                        id: pdf.PDF[0].id,
                        path: `${r_folder}/${dest_folder}/${f_name}`
                    })
                }
            }));
        }));
    }));
})();

function deleteFolderRecursive(p) {
    if (fs.existsSync(p)) {
        fs.readdirSync(p).forEach((file, index) => {
            const curPath = path.join(p, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(p);
    }
};