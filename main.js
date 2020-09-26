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
                const pdfs = await drive.listFiles({
                    folder: lesson.FOLDER[0].id,
                    // match: RegExp(`[0-9][0-9][\.]ДЗ[_]*`)
                });
                if (pdfs.PDF.length) {
                    return Promise.all(pdfs.PDF.map(async p => {
                        console.log('PDF:', p);
                        const f_name = p.name;
                        let dest_folder;
                        try {
                            const cut = f_name.split('_')[2];
                            dest_folder = cut.replace(new RegExp('[0-9]'), '').replace(' ', '');
                        } catch (error) {
                            console.error('PDF PARSE FAILED', p);
                            dest_folder = 'ParseFailed'
                        }
                        await drive.getFile({
                            id: p.id,
                            path: `${r_folder}/${dest_folder}/${f_name}`
                        });
                    }));
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