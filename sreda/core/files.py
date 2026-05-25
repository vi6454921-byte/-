import os
import shutil
from pathlib import Path


SAFE_TEXT_EXTS = {".txt", ".md", ".log", ".json", ".yml", ".yaml", ".ini", ".cfg", ".csv", ".py", ".js", ".html", ".css", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".sql"}

MAX_READ_BYTES = 200_000


def _expand(path: str) -> str:
    return os.path.abspath(os.path.expanduser(os.path.expandvars(path)))


def read_text_file(path: str) -> str:
    p = _expand(path)
    if not os.path.exists(p):
        return f"Файл не найден: {path}"
    if os.path.isdir(p):
        return f"'{path}' — это папка, не файл."
    ext = os.path.splitext(p)[1].lower()
    if ext and ext not in SAFE_TEXT_EXTS:
        return f"Я могу читать только текстовые файлы. Расширение '{ext}' не разрешено."
    try:
        size = os.path.getsize(p)
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            data = f.read(MAX_READ_BYTES)
        suffix = "" if size <= MAX_READ_BYTES else f"\n\n... [вывод обрезан до {MAX_READ_BYTES // 1000} КБ из {size // 1000} КБ]"
        return f"Содержимое {path}:\n\n{data}{suffix}"
    except Exception as e:
        return f"Не смогла прочитать файл: {e}"


def write_text_file(path: str, content: str, append: bool = False) -> str:
    p = _expand(path)
    parent = os.path.dirname(p)
    if parent and not os.path.exists(parent):
        try:
            os.makedirs(parent, exist_ok=True)
        except Exception as e:
            return f"Не смогла создать папку: {e}"
    try:
        mode = "a" if append else "w"
        with open(p, mode, encoding="utf-8") as f:
            f.write(content)
        return f"Файл сохранён: {path}"
    except Exception as e:
        return f"Не смогла записать в файл: {e}"


def create_folder(path: str) -> str:
    p = _expand(path)
    try:
        os.makedirs(p, exist_ok=True)
        return f"Создала папку: {path}"
    except Exception as e:
        return f"Не смогла создать папку: {e}"


def delete_path(path: str) -> str:
    p = _expand(path)
    if not os.path.exists(p):
        return f"Не существует: {path}"
    try:
        if os.path.isdir(p):
            shutil.rmtree(p)
            return f"Папка удалена: {path}"
        os.remove(p)
        return f"Файл удалён: {path}"
    except Exception as e:
        return f"Не смогла удалить: {e}"
