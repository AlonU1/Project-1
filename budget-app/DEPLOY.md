# העלאת אפליקציית הבקרה התקציבית לרשת (Supabase + Vite + Netlify/Vercel)

מדריך צעד‑אחר‑צעד. זמן משוער: 20–30 דקות. עלות: חינם.
דורש Node.js מותקן (גרסה 18 ומעלה).

---

## מבנה התיקייה שקיבלת

```
deploy/
├─ index.html
├─ package.json
├─ vite.config.js
├─ .env.example
├─ supabase.sql
└─ src/
   ├─ App.jsx        ← האפליקציה שלך (כבר מותאמת לשמירה בענן)
   ├─ storage.js     ← שכבת השמירה (Supabase עם נפילה ל-localStorage)
   └─ main.jsx
```

---

## שלב 1 — הקמת Supabase (מסד הנתונים בענן)

1. היכנס ל‑https://supabase.com והירשם (חינם, אפשר עם Google).
2. לחץ **New project**. בחר שם (למשל `beit-elazar`), סיסמה למסד, ואזור (Frankfurt הכי קרוב).
3. המתן ~2 דקות עד שהפרויקט מוכן.
4. בתפריט הצד → **SQL Editor** → **New query**. הדבק את כל התוכן של `supabase.sql` ולחץ **Run**.
   זה יוצר טבלת `kv` שבה נשמר כל מצב האפליקציה.
5. בתפריט הצד → **Project Settings → API**. העתק שני ערכים:
   - **Project URL**
   - **anon public** key

---

## שלב 2 — הרצה מקומית (לוודא שהכול עובד)

בטרמינל, בתוך תיקיית `deploy`:

```bash
npm install
cp .env.example .env
```

פתח את `.env` והדבק את שני הערכים מ‑Supabase:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

הרץ:

```bash
npm run dev
```

פתח את הכתובת שמופיעה (בדרך כלל http://localhost:5173).
עדכן משהו באפליקציה, רענן — הנתונים נשמרים. פתח מדפדפן/מכשיר אחר עם אותה כתובת — תראה את אותם נתונים. זה אומר שהענן עובד.

---

## שלב 3 — העלאה לרשת (בחר אחת)

### אפשרות א' — Vercel (הכי פשוט)
1. העלה את תיקיית `deploy` ל‑GitHub (repo חדש), או השתמש ב‑Vercel CLI.
2. היכנס ל‑https://vercel.com → **Add New → Project** → בחר את ה‑repo.
3. תחת **Environment Variables** הוסף את `VITE_SUPABASE_URL` ו‑`VITE_SUPABASE_ANON_KEY`.
4. לחץ **Deploy**. תוך דקה תקבל כתובת קבועה (למשל `beit-elazar.vercel.app`).

### אפשרות ב' — Netlify
1. `npm run build` יוצר תיקיית `dist`.
2. גרור את `dist` ל‑https://app.netlify.com/drop, **או** חבר את ה‑repo.
3. אם חיברת repo: תחת **Site settings → Environment variables** הוסף את שני משתני ה‑Supabase, ובנה מחדש.
   פקודת build: `npm run build` · תיקיית פרסום: `dist`.

---

## גיבוי וייצוא
- כפתור **ייצוא Excel** באפליקציה שומר עותק מלא בכל רגע — השתמש בו כגיבוי תקופתי.
- הנתונים בענן נשמרים תחת מפתח יחיד (`beit-elazar-budget-v1`) בטבלת `kv`.

## אבטחה — שים לב
הפוליסות ב‑`supabase.sql` פתוחות: כל מי שיש לו את הכתובת ואת ה‑anon key יכול לקרוא ולכתוב.
זה מתאים לכלי פנימי שהקישור אליו לא מפורסם. לרמת אבטחה גבוהה יותר:
- הפעל **Supabase Auth** (אימייל/סיסמה) והחלף את הפוליסות כך שרק משתמשים מחוברים ייגשו.
- או הוסף שדה `project_id` לטבלה כדי להפריד בין פרויקטים/לקוחות.

## ריבוי פרויקטים (בהמשך)
כרגע האפליקציה שומרת פרויקט אחד. כדי לתמוך בכמה, אפשר להחליף את המפתח הקבוע במזהה פרויקט נבחר — ספר לי ואוסיף בורר פרויקטים.
