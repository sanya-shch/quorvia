import path from "node:path";

/** Каталог готових експортів. API віддає файли звідси, воркер їх сюди пише. */
export const EXPORTS_DIR = path.join(process.cwd(), "uploads", "exports");

/**
 * Безпечно перетворює збережене в БД ім'я файлу на абсолютний шлях усередині
 * каталогу експортів. Повертає null, якщо результат виходить за його межі
 * (напр. "../../etc/passwd"): шлях береться з БД, але видалення й віддача
 * файлів не повинні покладатись на те, що значення там завжди чесне.
 */
export const resolveExportPath = (filePath: string, dir: string = EXPORTS_DIR): string | null => {
  const root = path.resolve(dir);
  const absolute = path.resolve(root, filePath);

  return absolute.startsWith(root + path.sep) ? absolute : null;
};
