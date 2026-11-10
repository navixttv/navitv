import {
    DEFAULT_CONTENT_COUNTRIES,
    isCategoryOutsideCountries,
    type XtreamCategory,
} from '@iptvnator/shared/interfaces';

/**
 * NaviTV country filter for the browser / TV builds (no SQLite catalog).
 *
 * The desktop build hides foreign categories when it imports them. The PWA
 * reads the provider on every visit instead, so here the filter runs at the
 * read boundary: foreign categories are dropped from the category list, and
 * the catalog is requested one kept category at a time. Large multi-country
 * providers answer the "everything" request with tens of megabytes, more
 * than a TV stick can hold; the kept categories alone are a fraction of it.
 */

/** Requests in flight at once while reading the catalog per category. */
export const CATALOG_CATEGORY_CONCURRENCY = 4;

/** Categories the country filter keeps, in provider order. */
export function keptCatalogCategories(
    categories: readonly XtreamCategory[],
    allowed: readonly string[] = DEFAULT_CONTENT_COUNTRIES
): XtreamCategory[] {
    return categories.filter(
        (category) =>
            !isCategoryOutsideCountries(category.category_name, allowed)
    );
}

interface CatalogRow {
    readonly category_id?: string | number | null;
    readonly stream_id?: string | number | null;
    readonly series_id?: string | number | null;
}

function rowKey(row: CatalogRow): string | null {
    const id = row.series_id ?? row.stream_id;
    return id === undefined || id === null ? null : String(id);
}

function sameId(a: unknown, b: unknown): boolean {
    return String(a ?? '') === String(b ?? '');
}

/**
 * Reads the catalog of the given categories, a few requests at a time, and
 * returns the rows in category order without duplicates.
 *
 * Some providers ignore `category_id` and answer every request with the whole
 * catalog. The first answer that carries rows of another category is taken
 * as that whole catalog: it is filtered to the kept categories and no further
 * request is started.
 */
export async function fetchCatalogByCategory<T extends CatalogRow>(
    categoryIds: readonly (string | number)[],
    fetchCategory: (categoryId: string | number) => Promise<T[]>,
    options: {
        readonly concurrency?: number;
        readonly signal?: AbortSignal;
        readonly onProgress?: (count: number) => void;
    } = {}
): Promise<T[]> {
    const concurrency = Math.max(
        1,
        options.concurrency ?? CATALOG_CATEGORY_CONCURRENCY
    );
    const kept = new Set(categoryIds.map((id) => String(id)));
    const results: (T[] | undefined)[] = new Array(categoryIds.length);
    // A holder, not a `let`: the workers assign it inside closures.
    const found: { wholeCatalog: T[] | null } = { wholeCatalog: null };
    let next = 0;
    let loaded = 0;

    const worker = async (): Promise<void> => {
        while (found.wholeCatalog === null && next < categoryIds.length) {
            options.signal?.throwIfAborted();
            const index = next++;
            const categoryId = categoryIds[index];
            const rows = await fetchCategory(categoryId);
            options.signal?.throwIfAborted();
            const list = Array.isArray(rows) ? rows : [];
            if (
                list.some(
                    (row) =>
                        row.category_id !== undefined &&
                        row.category_id !== null &&
                        !sameId(row.category_id, categoryId)
                )
            ) {
                found.wholeCatalog ??= list.filter((row) =>
                    kept.has(String(row.category_id ?? ''))
                );
                return;
            }
            results[index] = list;
            loaded += list.length;
            options.onProgress?.(loaded);
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(concurrency, categoryIds.length) }, () =>
            worker()
        )
    );

    let source: readonly T[];
    if (found.wholeCatalog !== null) {
        source = found.wholeCatalog;
    } else {
        const joined: T[] = [];
        for (const rows of results) {
            if (rows) joined.push(...rows);
        }
        source = joined;
    }
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of source) {
        const key = rowKey(row);
        if (key !== null) {
            if (seen.has(key)) continue;
            seen.add(key);
        }
        out.push(row);
    }
    return out;
}
