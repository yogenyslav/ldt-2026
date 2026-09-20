"""HTML-отчёт по EDA: постановка задачи, примеры снимков по критериям, выводы.

Запуск: python scripts/data_analysis/build_report.py  (после build_index.py)
Выход:  reports/eda_report.html — один файл, картинки встроены.
"""
import base64
import html
import io

import matplotlib
import matplotlib.pyplot as plt
import pandas as pd
from PIL import Image

matplotlib.use("Agg")

import eda_utils as eu

OUT = eu.ROOT / "reports" / "eda_report.html"


def fig_to_img(fig, alt: str) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=130, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    data = base64.b64encode(buf.getvalue()).decode()
    return f'<img class="chart" alt="{html.escape(alt)}" src="data:image/png;base64,{data}">'


def dicom_to_src(path: str) -> str:
    buf = io.BytesIO()
    Image.fromarray(eu.read_pixels(path)).save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def thumbs(df: pd.DataFrame) -> str:
    cards = []
    for _, row in df.iterrows():
        status = "bad" if row.get("total") == 1 else "ok" if row.get("total") == 0 else "none"
        row_no = f"№{int(row['row_no'])} · " if pd.notna(row.get("row_no")) else ""
        caption = f"{row_no}{eu.REGION_RU[row['region']]}<br><b>{html.escape(eu.violations_text(row))}</b>"
        cards.append(f'<figure class="thumb {status}"><img alt="{html.escape(eu.violations_text(row))}" '
                     f'src="{dicom_to_src(row["path"])}"><figcaption>{caption}</figcaption></figure>')
    return f'<div class="thumbs">{"".join(cards)}</div>'


def pure(labeled: pd.DataFrame, region: str, criterion: str | None, n: int,
         prefer: tuple[int, ...] = ()) -> pd.DataFrame:
    """Снимки зоны только с одним нарушением `criterion` (или нормы, если None); `prefer` — № строк, показать первыми."""
    sub = labeled[labeled["region"] == region]
    crit = eu.CRITERIA[region]
    if criterion is None:
        sub = sub[sub["total"] == 0]
    else:
        others = [c for c in crit if c != criterion]
        sub = sub[(sub["total"] == 1) & (sub[criterion] == 1) & (sub[others].sum(axis=1) == 0)]
    order = sub["row_no"].map(lambda r: (prefer.index(r) if r in prefer else len(prefer), r))
    return sub.loc[order.sort_values().index].head(n)


def stat(value, label: str) -> str:
    return f'<div class="stat"><div class="stat-value">{value}</div><div class="stat-label">{label}</div></div>'


def table(df: pd.DataFrame, index: bool = True) -> str:
    return f'<div class="table-wrap">{df.to_html(border=0, classes="data", na_rep="—", index=index)}</div>'


CSS = """
:root { --bg:#f7f6f3; --card:#ffffff; --ink:#1d1d1b; --ink-2:#52514e; --muted:#8a8984; --line:#e4e2dc;
        --ok:#2a78d6; --bad:#eb6834; --accent:#1c5cab; --note:#fff7e8; --note-line:#eda100; }
* { box-sizing:border-box; }
body { background:var(--bg); color:var(--ink); font:15px/1.6 "Segoe UI", system-ui, -apple-system, sans-serif;
       margin:0; padding-inline:16px; }
main { max-width:1040px; margin:0 auto; padding-block:40px 80px; }
header { margin-bottom:28px; }
.kicker { color:var(--accent); font-weight:600; font-size:13px; letter-spacing:.04em; text-transform:uppercase; }
h1 { font-size:32px; line-height:1.2; margin:6px 0 10px; }
h2 { font-size:22px; margin:48px 0 12px; padding-top:12px; border-top:1px solid var(--line); }
h3 { font-size:17px; margin:28px 0 8px; }
p, li { color:var(--ink-2); max-width:78ch; }
b, strong { color:var(--ink); }
code { background:#eeede8; padding:1px 5px; border-radius:4px; font-size:13px; }
nav { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:14px; margin-top:14px; }
nav a { color:var(--accent); text-decoration:none; }
.stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin:22px 0; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
.stat-value { font-size:28px; font-weight:700; line-height:1.1; }
.stat-label { color:var(--ink-2); font-size:13px; margin-top:4px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin:14px 0; }
.chart { display:block; max-width:100%; height:auto; margin:6px auto; }
.note { background:var(--note); border-left:4px solid var(--note-line); border-radius:6px; padding:12px 16px; margin:14px 0; }
.note p { margin:4px 0; }
.flow { display:flex; flex-wrap:wrap; align-items:stretch; gap:8px; margin:14px 0; }
.flow div { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 14px; flex:1 1 170px; font-size:14px; }
.flow div b { display:block; }
.flow .arrow { flex:0 0 auto; border:none; background:none; color:var(--muted); align-self:center; padding:0; }
.criterion { display:grid; grid-template-columns:minmax(220px, 1fr) 2fr; gap:18px; align-items:start; }
@media (max-width:720px) { .criterion { grid-template-columns:1fr; } h1 { font-size:26px; } }
.thumbs { display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px; align-items:start; }
.thumb { margin:0; background:#000; border-radius:8px; overflow:hidden; border:3px solid var(--muted); }
.thumb.ok { border-color:var(--ok); } .thumb.bad { border-color:var(--bad); }
.thumb img { display:block; width:100%; height:auto; image-rendering:auto; }
.thumb figcaption { background:var(--card); color:var(--ink-2); font-size:12px; line-height:1.35; padding:6px 8px; }
.legend { display:flex; gap:16px; font-size:13px; color:var(--ink-2); margin:6px 0 12px; flex-wrap:wrap; }
.legend span::before { content:""; display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:6px; vertical-align:-1px; }
.legend .ok::before { background:var(--ok); } .legend .bad::before { background:var(--bad); } .legend .none::before { background:var(--muted); }
.table-wrap { overflow-x:auto; }
table.data { border-collapse:collapse; font-size:13px; margin:8px 0; }
table.data th, table.data td { border-bottom:1px solid var(--line); padding:5px 10px; text-align:left; }
table.data th { color:var(--ink-2); font-weight:600; }
ol li, ul li { margin:4px 0; }
footer { color:var(--muted); font-size:13px; margin-top:60px; }
"""


def build() -> str:
    eu.setup_style()
    index, labels, images = eu.load()
    train = index[index["split"] == "train"]
    labeled = images[images["labeled"]]

    hips = labels[labels["region"] != "spine"].pivot_table(index="study_id", columns="region", values="total")
    hips_ct = pd.crosstab(hips["hip_left"], hips["hip_right"])
    hips_ct.index = ["левое: норма", "левое: нарушение"]
    hips_ct.columns = ["правое: норма", "правое: нарушение"]

    mismatch = labels.loc[~labels["total_equals_or"], ["row_no", "placement", "axis", "artifacts", "total", "comment"]]
    mismatch = mismatch.astype({c: int for c in ["placement", "axis", "artifacts"]})
    mismatch.columns = ["№", "укладка", "ось", "артефакты", "итог", "комментарий"]

    s = []
    s.append(f"""
<header>
  <div class="kicker">EDA · обучающий набор · 2026-09-15</div>
  <h1>Контроль качества DXA-денситометрии: что за данные и какая задача</h1>
  <p>Разбор обучающего набора организатора: как устроены файлы и разметка, как метки связаны со снимками,
  как выглядят нарушения по каждому критерию ТЗ и что из этого следует для модели.</p>
  <nav>
    <a href="#task">Постановка</a><a href="#criteria">Критерии в картинках</a><a href="#data">Файлы и разметка</a>
    <a href="#labels">Статистика меток</a><a href="#images">Изображения</a><a href="#takeaways">Выводы</a>
    <a href="#questions">Открытые вопросы</a>
  </nav>
</header>
<div class="stats">
  {stat(train['study_id'].nunique(), "исследований с разметкой")}
  {stat(len(train), "DICOM-файлов")}
  {stat(len(images), "уникальных снимков после удаления дубликатов")}
  {stat(len(labeled), "снимков с меткой (1 снимок = 1 зона)")}
  {stat(int(labeled['total'].sum()), "снимков с нарушением")}
</div>
""")

    s.append("""
<h2 id="task">1. Постановка задачи</h2>
<p>Денситометрист делает снимки <b>поясничного отдела позвоночника</b> и <b>проксимального отдела бедра</b>
(обычно обоих). Прибор сам ставит области измерения и считает плотность кости, но результат достоверен только
при правильной укладке пациента и чистом поле. Сервис должен автоматически проверять качество снимка вместо
врача.</p>
<div class="flow">
  <div><b>Вход</b>DICOM-исследование, 1–3 снимка, без разметки</div><div class="arrow">→</div>
  <div><b>Зона</b>позвоночник / правое бедро / левое бедро</div><div class="arrow">→</div>
  <div><b>Качество</b><code>quality_class</code>: 0 — норма, 1 — нарушение</div><div class="arrow">→</div>
  <div><b>Типы нарушений</b><code>violation_type</code>, может быть несколько</div>
</div>
<p>Выход — csv/xlsx, <b>одна строка на снимок</b>: <code>path_to_study, study_uid, image_uid, anatomical_region,
quality_class, violation_type, processing_status, time_of_processing</code>. Приоритетные метрики — <b>F1 и ROC-AUC</b>,
отдельно по зонам и типам нарушений, с 95% доверительными интервалами. Для промежуточной сдачи достаточно бинарного
класса и оценки хотя бы одной зоны.</p>
""")

    criteria_doc = [
        ("spine", None, "Позвоночник: норма",
         "Позвоночник по центру и вдоль оси скана; сверху видна примерно половина Th12, снизу — верхние края "
         "подвздошных костей (по методичке: L1–L4 полностью и часть L5)."),
        ("spine", "artifacts", "Позвоночник: посторонние предметы и артефакты",
         "Металл и плотные предметы в поле скана. Хорошо заметны <b>дуги косточек бюстгальтера</b> в верхней "
         "части снимка (как в примере из ТЗ) и металлические застёжки; на части снимков артефакт на превью "
         "малозаметен. Самое частое нарушение позвоночника.", (59, 100, 85, 87, 82, 91)),
        ("spine", "axis", "Позвоночник: ось наклонена больше 5°",
         "Пациент лежит под углом к линии сканирования. В ТЗ порог — 5°. Сюда же эксперт относит часть случаев "
         "сколиоза, но не всегда отмечая критерий (см. раздел о разметке)."),
        ("spine", "placement", "Позвоночник: неправильная укладка",
         "Поле скана смещено по вертикали: не видна половина Th12 сверху или края подвздошных костей снизу."),
        ("hip_right", None, "Бедро: норма",
         "Видны большой вертел, шейка бедра и седалищная кость; ось бедра вдоль скана; малый вертел лишь "
         "<b>слегка</b> выступает за внутренний контур — это признак правильной внутренней ротации."),
        ("hip_left", "positioning", "Бедро: позиционирование / ротация",
         "В разметке одна колонка на два критерия ТЗ. Недоротация — малый вертел сильно выступает, шейка "
         "укорочена; переротация — малого вертела не видно, контур гладкий. Сюда же — бедро не вдоль оси скана."),
        ("hip_right", "roi", "Бедро: некорректная область интереса",
         "Недостаточный запас поля вокруг анатомии: по ТЗ ≥ 3 см сверху и снизу, ≥ 2 см сбоку. "
         "Самый редкий класс — 3–4 примера на сторону."),
    ]
    s.append('<h2 id="criteria">2. Критерии качества в картинках</h2>'
             '<p>Для каждого критерия — описание из ТЗ и методических рекомендаций и реальные снимки из набора '
             'с <b>только этим</b> нарушением. Подпись: № строки в разметке, зона, отмеченные нарушения.</p>'
             '<div class="legend"><span class="ok">норма</span><span class="bad">нарушение</span></div>')
    for region, criterion, title, text, *prefer in criteria_doc:
        examples = pure(labeled, region, criterion, 6, *prefer)
        if criterion is None and region == "hip_right":
            examples = pd.concat([examples.head(3), pure(labeled, "hip_left", None, 3)])
        if criterion == "roi":
            examples = pd.concat([examples, pure(labeled, "hip_left", "roi", 6)]).head(6)
        s.append(f'<div class="card criterion"><div><h3>{title}</h3><p>{text}</p></div>{thumbs(examples)}</div>')

    s.append(f"""
<h2 id="data">3. Как устроены файлы и разметка</h2>
<h3>Файлы</h3>
<ul>
  <li>Все снимки с одного аппарата — <b>GE Lunar Prodigy Advance</b>, 8 бит, маленькие (ширина 280–300 px).
  <code>PixelSpacing</code> в тегах нет, так что «3 см» напрямую в пиксели не перевести.</li>
  <li>В исследовании от 1 до 29 файлов, но <b>{int(train['is_duplicate'].sum())} из {len(train)}</b> — точные
  попиксельные копии внутри того же исследования (разные UID, одинаковые пиксели). После удаления копий в каждом
  исследовании 1–3 снимка, как и сказано в ТЗ. Между разными исследованиями одинаковых снимков нет.</li>
  <li>Имя папки исследования (на него ссылается разметка) <b>не совпадает</b> со <code>StudyInstanceUID</code> в тегах.
  В выходном файле по ТЗ нужен UID из тегов.</li>
</ul>
<div class="card">{fig_to_img(eu.plot_files_per_study(index, images), "Файлов и уникальных снимков на исследование")}</div>

<h3>Разметка</h3>
<p><code>разметка.xlsx</code>: одна строка — одно исследование; для каждой зоны — критерии (0/1) и итог.
Пустая ячейка — зоны нет в исследовании. <b>Имени файла в разметке нет</b>, в DICOM зона тоже не записана
(<code>BodyPartExamined</code>, <code>Laterality</code> пустые).</p>

<h3>Как метки привязываются к снимкам</h3>
<p>Связь всё-таки есть, просто неявная — через исследование и зону. В одном исследовании на каждую зону ровно
один уникальный снимок, а зону можно надёжно определить по самому снимку:</p>
<ol>
  <li><b>Позвоночник или бедро</b> — по ширине: позвоночник всегда 300 px, бедро — 280 px (в одном исследовании 248).</li>
  <li><b>Правое или левое бедро</b> — по изображению: у правого бедра таз справа на снимке, у левого — слева
  (соглашение взято из тестовых файлов с суффиксами <code>_ППОБ</code> / <code>_ЛПОБ</code>).</li>
</ol>
<div class="note"><p><b>Результат:</b> все 249 меток получили ровно один снимок, конфликтов нет; на 3 тестовых
файлах зона определена верно; глазами проверены все 153 снимка бедра. Порядок снимков (InstanceNumber) для
стороны не годится — в 29 из 74 исследований правое бедро идёт первым.</p></div>
<div class="card">{fig_to_img(eu.plot_side_score(images), "Разделение левого и правого бедра")}</div>
<p>Без метки остались 3 снимка — <b>бёдра с эндопротезом</b> (№66, №70): эксперт такие зоны не оценивал.</p>
{thumbs(images[~images['labeled']])}
""")

    s.append(f"""
<h2 id="labels">4. Статистика меток</h2>
<div class="card">{fig_to_img(eu.plot_violation_share(labels), "Доля нарушений по зонам")}</div>
<ul>
  <li>Состав исследований: все три зоны — 72, только позвоночник — 22, позвоночник + левое бедро — 5, только левое бедро — 1.</li>
  <li>По исследованиям ровно <b>50 с нарушением и 50 без</b> — набор сбалансирован искусственно; в реальном потоке нарушений, скорее всего, меньше.</li>
  <li>Нарушения на снимке почти всегда одиночные: больше одного критерия — у 2 снимков позвоночника и 1 снимка каждого бедра.</li>
</ul>
<div class="card">{fig_to_img(eu.plot_criteria(labels), "Число нарушений по критериям")}</div>
<h3>Левое и правое бедро одного пациента нарушаются вместе</h3>
<p>Если одно бедро размечено как нарушение, второе тоже нарушено примерно в двух случаях из трёх (13 из 19–21). Это общая укладка и один
лаборант, поэтому <b>делить на train/val нужно только по исследованию</b>.</p>
{table(hips_ct)}
<h3>Итог не всегда следует из критериев</h3>
<p>По бёдрам итог — всегда «хотя бы один критерий». По позвоночнику 3 исключения: при сколиозе эксперт ставит
нарушение без отмеченного критерия, при переломе — наоборот. Нужно решить, что считать истиной, — вопрос к организаторам.</p>
{table(mismatch, index=False)}
""")

    s.append(f"""
<h2 id="images">5. Что видно по изображениям</h2>
<h3>Высота скана бедра связана с разметкой</h3>
<p>Ширина снимка фиксирована, а высота зависит от длины сканирования. У бедра при типичной высоте 280–300 px
нарушений почти нет (1 из 36), а у слишком коротких и слишком длинных сканов — 40–50%. Вероятно, это отражает
поле обзора и перепозиционирование. Хороший простой признак для бейзлайна, но выборки маленькие — легко переобучиться.</p>
<div class="card">{fig_to_img(eu.plot_size_by_region(images), "Высота снимков по зонам")}</div>
<div class="card">{fig_to_img(eu.plot_violation_rate_by_height(images), "Доля нарушений по высоте снимка бедра")}</div>
<h3>Средний снимок: норма и нарушение</h3>
<p>Снимки приведены к одному размеру и усреднены. У бедра разность собирается вдоль диафиза и в зоне малого вертела и седалищной кости — положение
и ротация бедра в кадре отличаются систематически. У позвоночника разница мелкая и пятнистая: нарушения там
разнородные (артефакты, ось, укладка) и в среднем компенсируют друг друга.</p>
<div class="card">{fig_to_img(eu.plot_mean_images(eu.mean_images(images), images), "Средние снимки норма / нарушение")}</div>
""")

    s.append("""
<h2 id="takeaways">6. Выводы для модели</h2>
<ol>
  <li><b>Единица предсказания — снимок</b> (одна зона). Пайплайн: дедупликация → зона и сторона → бинарное качество → типы нарушений.</li>
  <li><b>Данных очень мало</b>: 249 размеченных снимков, 73 нарушения. Нужны кросс-валидация по исследованиям,
  аугментации и доверительные интервалы; отложенная выборка из 20 исследований будет очень шумной.</li>
  <li><b>Редкие классы</b>: область интереса бедра — 3–4 примера на сторону, укладка позвоночника — 6. Надёжный
  multi-label по всем типам на этих данных не обучить. Реалистичный MVP — бинарный класс по зонам плюс частые типы:
  артефакты, ось, позиционирование/ротация.</li>
  <li><b>Утечки</b>: дубликаты внутри исследования и связь левого и правого бедра — делить строго по исследованию,
  дедуплицировать до разбиения.</li>
  <li><b>Зона определяется почти бесплатно</b> (ширина и яркость), но на закрытом тесте с другим экспортом правило
  может не сработать — нужен запасной классификатор по изображению.</li>
  <li><b>Многие критерии геометрические</b>: угол оси, запасы поля, видимость Th12, подвздошных костей и малого вертела.
  Кандидат — ключевые точки или сегментация плюс правила; это же даёт объяснимость и визуализацию для доп. функционала.
  Мешает отсутствие PixelSpacing.</li>
  <li><b>Простой бейзлайн</b>: признаки размера и формы скана + небольшая CNN или предобученный энкодер на
  снимке, отдельная голова на каждую зону.</li>
</ol>

<h2 id="questions">7. Открытые вопросы</h2>
<ul>
  <li>Что считать истиной, если итог расходится с критериями (сколиоз, перелом)? Сколиоз — это нарушение оси?</li>
  <li>Как выдавать результат для снимков-дубликатов и снимков с эндопротезом?</li>
  <li>Разделять ли позиционирование и ротацию бедра в <code>violation_type</code> (в разметке одна колонка)?</li>
  <li>«Корректность разметки» в ТЗ — это поле скана или области измерения, которые ставит программа прибора?
  Второго на снимках нет.</li>
  <li>Физический размер пикселя для Lunar Prodigy (PixelSpacing отсутствует).</li>
  <li>Формат закрытого теста: структура папок, другие аппараты, словарь значений и уровень расчёта метрик.</li>
</ul>
<footer>Сгенерировано <code>scripts/data_analysis/build_report.py</code> из <code>data/index.csv</code>,
<code>labels.csv</code>, <code>images.csv</code>. Подробные таблицы и все галереи — в <code>notebooks/01_eda.ipynb</code>.</footer>
""")

    body = "\n".join(s)
    return (f'<!doctype html><html lang="ru"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f"<title>EDA DXA-денситометрии</title><style>{CSS}</style></head><body><main>{body}</main></body></html>")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(), encoding="utf-8")
    print(f"{OUT.relative_to(eu.ROOT)}: {OUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
