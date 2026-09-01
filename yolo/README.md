# YOLO — פרויקט התנסות ראשוני

סקריפטים קצרים לזיהוי אובייקטים עם **YOLOv8** (ספריית Ultralytics), על בסיס מודל מאומן מראש.
לא צריך לאמן כלום כדי להתחיל — המודל מזהה 80 סוגי אובייקטים מתוך דאטהסט COCO (אנשים, רכבים, בעלי חיים ועוד).

## התקנה

```bash
cd yolo
python -m venv .venv
source .venv/bin/activate        # ב-Windows:  .venv\Scripts\activate
pip install -r requirements.txt
```

ההתקנה מושכת גם את PyTorch ו-OpenCV, אז היא לוקחת כמה דקות ותופסת כמה GB.

## הרצה ראשונה

```bash
python detect.py --source https://ultralytics.com/images/bus.jpg
```

בפעם הראשונה הסקריפט מוריד אוטומטית את קובץ המשקולות `yolov8n.pt` (כ-6MB), אז צריך חיבור לאינטרנט.
התמונה עם התיבות המסומנות נשמרת תחת `runs/detect/predict/`, ובטרמינל מודפס סיכום של מה שזוהה.

### עוד דוגמאות

```bash
python detect.py --source photo.jpg --conf 0.5      # רק זיהויים בביטחון 50% ומעלה
python detect.py --source my_photos/                # כל התמונות בתיקייה
python detect.py --source clip.mp4 --model yolov8s.pt
python detect.py --source 0 --show                  # מצלמת רשת, חלון תצוגה חי
python detect.py --source photo.jpg --classes 0 2   # רק "person" ו-"car"
```

`--help` מציג את כל הדגלים.

### בחירת מודל

| משקולות | גודל | מהירות | דיוק |
|---------|------|--------|------|
| `yolov8n.pt` | ננו | הכי מהיר | הכי נמוך |
| `yolov8s.pt` | קטן | מהיר | בינוני |
| `yolov8m.pt` | בינוני | סביר | טוב |
| `yolov8l.pt` / `yolov8x.pt` | גדול | איטי | הכי גבוה |

מתחילים מ-`yolov8n` ומעלים רק אם הדיוק לא מספיק.

## אימון על דאטהסט משלך

1. מסדרים את התמונות והתוויות במבנה YOLO (הסבר מלא בתוך `data/example_dataset.yaml`).
2. מעתיקים את קובץ ה-YAML ומעדכנים בו את הנתיב ואת שמות המחלקות.
3. מריצים:

```bash
python train.py --data data/example_dataset.yaml --epochs 50
```

בסיום מודפסות מדדי mAP, והמשקולות הטובות ביותר נשמרות ב-`runs/detect/exp/weights/best.pt`
(הנתיב המדויק מודפס בסוף הריצה).
אפשר להשתמש בהן ישירות לזיהוי:

```bash
python detect.py --source test.jpg --model runs/detect/exp/weights/best.pt
```

לאימון אמיתי כדאי GPU (`--device 0`); על CPU זה יעבוד אבל יהיה איטי מאוד.

## קבצים

| קובץ | תפקיד |
|------|-------|
| `detect.py` | הרצת זיהוי על תמונה / וידאו / תיקייה / מצלמה |
| `train.py` | כיוונון מודל מאומן מראש על דאטהסט משלך + הערכת ביצועים |
| `data/example_dataset.yaml` | תבנית להגדרת דאטהסט |
| `requirements.txt` | תלויות |

> הערה: התיקייה הזו עצמאית לגמרי ואינה קשורה לאתר הסטטי שבשורש הריפו.
