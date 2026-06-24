/**
 * Apps Script — נקודת קצה לסנכרון אפליקציית "פיקוח אתר" ל-Google Sheets + Drive.
 *
 * התקנה (פעם אחת):
 *  1. צור גיליון חדש ב-Google Sheets.
 *  2. תפריט: Extensions  ←  Apps Script.
 *  3. מחק את הקוד הקיים, הדבק את כל הקובץ הזה, ושמור.
 *  4. Deploy  ←  New deployment  ←  בחר סוג "Web app".
 *       - Execute as:        Me
 *       - Who has access:    Anyone
 *  5. Deploy  ←  אשר את ההרשאות (Drive + Sheets).
 *  6. העתק את כתובת ה-"Web app URL" (מסתיימת ב-/exec) והדבק אותה
 *     בהגדרות הסנכרון באפליקציה (כפתור ☁️).
 *
 * מאז — כל רשומה נדחפת אוטומטית לגיליון, והתמונות עולות לתיקייה ב-Drive
 * עם קישור צפייה בגיליון. עדכון רשומה קיימת דורס את השורה והתמונות שלה.
 */

var SHEET_NAME = 'ליקויים';
var DRIVE_FOLDER = 'דוחות פיקוח - תמונות';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'delete') {
      deleteRow_(data.id);
    } else {
      upsert_(data.record, data.project || {});
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, msg: 'Inspection sync endpoint is live' });
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['מזהה', 'פרויקט', 'כתובת', 'סוג', 'אזור', 'מיקום', 'תיאור',
      'קטגוריה', 'חומרה', 'קבלן', 'טלפון', 'סטטוס', 'תאריך יעד',
      'GPS', 'מפה', 'נוצר', 'סונכרן', 'תמונות']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 18).setFontWeight('bold');
  }
  return sh;
}

function idColumn_(sh) {
  var n = Math.max(sh.getLastRow() - 1, 0);
  if (!n) return [];
  return sh.getRange(2, 1, n, 1).getValues().map(function (r) { return r[0]; });
}

function upsert_(r, p) {
  var sh = sheet_();
  var links = uploadPhotos_(r);
  var ST = { open: 'פתוח', prog: 'בטיפול', recheck: 'לתיקון חוזר', done: 'סגור' };
  var TY = { defect: 'ליקוי', task: 'משימת ביצוע', approval: 'אישור/בדיקה', note: 'הערה' };
  var gps = r.gps ? (r.gps.lat + ', ' + r.gps.lng) : '';
  var mapUrl = r.gps ? ('https://maps.google.com/?q=' + r.gps.lat + ',' + r.gps.lng) : '';
  var row = [r.id, p.name || '', p.address || '', TY[r.type] || r.type || '',
    r.area || '', r.location || '', r.desc || '', r.category || '',
    r.type === 'defect' ? (r.severity || '') : '', r.contractor || '', r.phone || '',
    ST[r.status] || r.status || '', r.due || '', gps, mapUrl,
    r.createdAt ? new Date(r.createdAt) : '', new Date(), links.join('\n')];
  var ids = idColumn_(sh);
  var idx = ids.indexOf(r.id);
  if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function deleteRow_(id) {
  var sh = sheet_();
  var ids = idColumn_(sh);
  var idx = ids.indexOf(id);
  if (idx >= 0) sh.deleteRow(idx + 2);
}

function rootFolder_() {
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER);
}

function recordFolder_(id) {
  var root = rootFolder_();
  var it = root.getFoldersByName(id);
  var f = it.hasNext() ? it.next() : root.createFolder(id);
  // נקה תמונות ישנות של אותה רשומה כדי למנוע כפילויות בעדכון
  var files = f.getFiles(), old = [];
  while (files.hasNext()) old.push(files.next());
  old.forEach(function (x) { x.setTrashed(true); });
  return f;
}

function uploadPhotos_(r) {
  if (!r.photos || !r.photos.length) return [];
  var f = recordFolder_(r.id);
  var links = [];
  r.photos.forEach(function (ph, i) {
    var m = (ph.data || '').match(/^data:(.+?);base64,(.*)$/);
    if (!m) return;
    var name = (ph.kind === 'after' ? 'אחרי' : 'לפני') + '_' + (i + 1) + '.jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
    var file = f.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    links.push((ph.kind === 'after' ? 'אחרי: ' : 'לפני: ') + file.getUrl());
  });
  return links;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
