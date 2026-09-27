from pathlib import Path
import pandas as pd
import zipfile

rename_mapping = {
    "Для теста": "test",
    "Исследования": "train",
}


def unzip(archive: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive) as zip_file:
        zip_file.extractall(destination)


def main() -> None:
    data_dir = Path(__file__).resolve().parent.parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    unzip(Path(__file__).resolve().parent.parent / "dataset.zip", data_dir)

    dataset_files = list(data_dir.glob("*.zip"))

    for archive in dataset_files:
        unzip(archive, data_dir)
        data_dir.joinpath(archive.name).unlink()

    for old_name, new_name in rename_mapping.items():
        old_path = data_dir / old_name
        new_path = data_dir / new_name
        if old_path.exists():
            old_path.rename(new_path)

    layout = pd.read_excel(data_dir / "разметка.xlsx")
    layout.to_csv(data_dir / "layout.csv", index=False, encoding="utf-8")

    data_dir.joinpath("разметка.xlsx").unlink()


if __name__ == "__main__":
    main()
