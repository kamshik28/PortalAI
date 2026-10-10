import { BadRequestException, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

type ParsedSubjectFolder = {
  aisSubjectId: string;
  code: string;
  name: string | null;
  sourceUrl: string;
};

export type ParsedSemesterFolder = {
  id: string;
  label: string;
};

type ParsedFolderDocument = {
  externalDocId: string;
  filename: string;
  sourceUrl: string;
  enteredBy: string | null;
  documentDate: string | null;
};

type DownloadedDocument = {
  buffer: Buffer;
  contentType: string | null;
};

@Injectable()
export class AisClientService {
  private readonly baseUrl = 'https://is.stuba.sk';

  private normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private isDebugTreeEnabled(): boolean {
    return process.env.AIS_DEBUG_TREE === 'true';
  }

  /**
   * Strict semester label only.
   * Valid:
   *   ZS 2025/2026
   *   LS 2025/2026
   *   WS 2025/2026
   *   SS 2025/2026
   *
   * Invalid:
   *   Úvod do štúdia 2019/2020
   *   Obhajoba diplomových prác v akad. r. 2025/26 ZS
   */
  private isStrictSemesterLabel(value: string): boolean {
    return /^\s*(ZS|LS|WS|SS)\s+20\d{2}\/20\d{2}\s*$/i.test(
      this.normalizeText(value),
    );
  }

  private seasonRank(label: string): number {
    if (/\b(LS|SS)\b/i.test(label)) return 1;
    if (/\b(ZS|WS)\b/i.test(label)) return 0;
    return -1;
  }

  async fetchHtml(
    pathOrUrl: string,
    uisAuthCookie: string,
    init?: RequestInit,
  ): Promise<string> {
    const finalUrl = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl}`;

    const res = await fetch(finalUrl, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Cookie: `UISAuth=${uisAuthCookie}`,
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const text = await res.text();

    if (!res.ok) {
      throw new BadRequestException(`AIS request failed: ${res.status}`);
    }

    return text;
  }

  async getDocumentServerIndexHtml(uisAuthCookie: string): Promise<string> {
    return this.fetchHtml('/auth/dok_server/index.pl?lang=sk', uisAuthCookie, {
      method: 'GET',
    });
  }

  async getFolderHtmlById(
    uisAuthCookie: string,
    folderId: string,
    pageOn?: number,
  ): Promise<string> {
    const pagePart = typeof pageOn === 'number' ? `;typ=mod;on=${pageOn}` : '';

    return this.fetchHtml(
      `/auth/dok_server/slozka.pl?ds=1;id=${folderId}${pagePart};lang=sk`,
      uisAuthCookie,
      { method: 'GET' },
    );
  }

  async downloadDocument(
    uisAuthCookie: string,
    downloadUrl: string,
  ): Promise<DownloadedDocument> {
    const finalUrl = downloadUrl.startsWith('http')
      ? downloadUrl
      : `${this.baseUrl}${downloadUrl}`;

    const res = await fetch(finalUrl, {
      method: 'GET',
      headers: {
        Cookie: `UISAuth=${uisAuthCookie}`,
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!res.ok) {
      throw new BadRequestException(`Download failed: ${res.status}`);
    }

    const contentType = res.headers.get('content-type');
    const arrayBuffer = await res.arrayBuffer();

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  }

  // ─── Semester discovery ────────────────────────────────────────────────────

  /**
   * Finds the AIS folder ID for the "Courses / Predmety" branch on the
   * document-server index page.
   *
   * Order matters:
   *   1. Exact label match ("Predmety", "Courses", "Subjects")
   *   2. Deepest <li> whose descendants contain semester links
   *   3. Sequential fallback
   *   4. Partial label fallback
   *
   * The previous bug happened because Strategy A returned the FIRST ancestor
   * with semester descendants, which was often the faculty root
   * ("Fakulta elektrotechniky a informatiky") instead of the real branch
   * ("Predmety").
   */
  findCoursesBranchFolderId(html: string): string | null {
    const $ = cheerio.load(html);
    const debug = this.isDebugTreeEnabled();

    type LinkEntry = {
      id: string;
      text: string;
      isSemester: boolean;
    };

    const allLinks: LinkEntry[] = [];

    $('a[href*="slozka.pl"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const idMatch = href.match(/id=(\d+)/);
      if (!idMatch) return;

      const text = this.normalizeText($(el).text());
      if (!text) return;

      allLinks.push({
        id: idMatch[1],
        text,
        isSemester: this.isStrictSemesterLabel(text),
      });
    });

    if (debug) {
      console.log(
        '[AIS INDEX LINKS] ' +
        allLinks
          .map(
            (l, i) =>
              `[${i}] id=${l.id} ${l.isSemester ? '(SEM)' : '     '} "${l.text}"`,
          )
          .join('\n              '),
      );
    }

    // ------------------------------------------------------------------
    // Strategy 0: exact label first
    // ------------------------------------------------------------------
    // This is intentionally BEFORE any structural strategy.
    // Your real AIS HTML already contains "Predmety", so this should win.
    const EXACT_LABELS = ['predmety', 'courses', 'subjects'];

    for (const link of allLinks) {
      const t = link.text.toLowerCase();
      if (EXACT_LABELS.includes(t)) {
        if (debug) {
          console.log(
            `[AIS COURSES BRANCH] Strategy 0 (exact label): "${link.text}" id=${link.id}`,
          );
        }
        return link.id;
      }
    }

    // ------------------------------------------------------------------
    // Strategy A: deepest <li> ancestor with semester descendants
    // ------------------------------------------------------------------
    // Important: do NOT return the first match.
    // Collect all candidates and choose the deepest one.
    const candidates: Array<{
      id: string;
      text: string;
      depth: number;
      semChildCount: number;
    }> = [];

    $('a[href*="slozka.pl"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') ?? '';
      const idMatch = href.match(/id=(\d+)/);
      if (!idMatch) return;

      const text = this.normalizeText($el.text());
      if (!text || this.isStrictSemesterLabel(text)) return;

      const $container = $el.closest('li');
      if (!$container.length) return;

      const semChildCount = $container
        .find('a[href*="slozka.pl"]')
        .toArray()
        .filter((a) => this.isStrictSemesterLabel(this.normalizeText($(a).text())))
        .length;

      if (semChildCount < 1) return;

      const depth = $container.parents('li').length;

      candidates.push({
        id: idMatch[1],
        text,
        depth,
        semChildCount,
      });
    });

    if (candidates.length > 0) {
      candidates.sort(
        (a, b) =>
          b.depth - a.depth ||
          b.semChildCount - a.semChildCount ||
          a.text.length - b.text.length,
      );

      const best = candidates[0];

      if (debug) {
        console.log(
          `[AIS COURSES BRANCH] Strategy A (deepest <li>): "${best.text}" id=${best.id} ` +
          `(depth=${best.depth}, semester child links=${best.semChildCount})`,
        );
      }

      return best.id;
    }

    // ------------------------------------------------------------------
    // Strategy B: sequential fallback
    // ------------------------------------------------------------------
    interface SemRun {
      parentIdx: number;
      length: number;
    }

    const runs: SemRun[] = [];
    let runLen = 0;
    let runParentIdx = -1;

    for (let i = 0; i < allLinks.length; i++) {
      if (allLinks[i].isSemester) {
        if (runLen === 0) runParentIdx = i - 1;
        runLen++;
      } else {
        if (runLen > 0) {
          runs.push({ parentIdx: runParentIdx, length: runLen });
          runLen = 0;
          runParentIdx = -1;
        }
      }
    }

    if (runLen > 0) {
      runs.push({ parentIdx: runParentIdx, length: runLen });
    }

    runs.sort((a, b) => b.length - a.length || a.parentIdx - b.parentIdx);

    const bestRun = runs[0];
    if (bestRun && bestRun.parentIdx >= 0) {
      const parent = allLinks[bestRun.parentIdx];

      if (debug) {
        console.log(
          `[AIS COURSES BRANCH] Strategy B (sequential, run length=${bestRun.length}): ` +
          `"${parent.text}" id=${parent.id}`,
        );
      }

      return parent.id;
    }

    // ------------------------------------------------------------------
    // Strategy C: partial-label fallback
    // ------------------------------------------------------------------
    const PARTIAL = ['predmet', 'course', 'subject'];

    for (const link of allLinks) {
      const t = link.text.toLowerCase();
      if (PARTIAL.some((p) => t.includes(p))) {
        if (debug) {
          console.log(
            `[AIS COURSES BRANCH] Strategy C (partial label): "${link.text}" id=${link.id}`,
          );
        }
        return link.id;
      }
    }

    if (debug) {
      console.warn(
        '[AIS COURSES BRANCH] All strategies failed. Falling back to full-page semester scan.',
      );
    }

    return null;
  }

  /**
   * Filters a list of parsed semesters to only those relevant for the current
   * academic year and term:
   *
   *   • Winter term (ZS / WS): only the winter semester of the current year
   *   • Summer term (LS / SS): both winter + summer semesters of the same year
   *
   * If parsing fails, the full list is returned unchanged.
   */
  filterRelevantSemesters(
    semesters: ParsedSemesterFolder[],
    currentLabel: string,
  ): ParsedSemesterFolder[] {
    const yearMatch = currentLabel.match(/(20\d{2}\/20\d{2})/);
    if (!yearMatch) return semesters;

    const currentYear = yearMatch[1];
    const isWinter = /\b(ZS|WS)\b/i.test(currentLabel);
    const isSummer = /\b(LS|SS)\b/i.test(currentLabel);

    return semesters.filter((s) => {
      const sYear = s.label.match(/(20\d{2}\/20\d{2})/);
      if (!sYear || sYear[1] !== currentYear) return false;

      if (isWinter) {
        return /\b(ZS|WS)\b/i.test(s.label);
      }

      if (isSummer) {
        return /\b(ZS|WS|LS|SS)\b/i.test(s.label);
      }

      return true;
    });
  }

  /**
   * Finds the folder ID for a semester whose display text matches
   * `semesterLabel` (case-insensitive substring match).
   * Checks the anchor link text first, then the nearest <tr>/<li> container.
   */
  findSemesterFolderIdByLabel(
    html: string,
    semesterLabel: string,
  ): string | null {
    const $ = cheerio.load(html);
    const labelLower = semesterLabel.toLowerCase();
    let foundId: string | null = null;

    $('a[href*="slozka.pl"]').each((_, el) => {
      if (foundId) return false as unknown as void;

      const href = $(el).attr('href') ?? '';
      const idMatch = href.match(/id=(\d+)/);
      if (!idMatch) return;

      // 1. Check anchor link text directly.
      const linkText = this.normalizeText($(el).text()).toLowerCase();

      if (linkText && linkText.includes(labelLower)) {
        foundId = idMatch[1];
        return;
      }

      // 2. Fall back: nearest table row or list item.
      const containerText = this.normalizeText(
        $(el).closest('tr, li').text(),
      ).toLowerCase();

      if (containerText && containerText.includes(labelLower)) {
        foundId = idMatch[1];
      }
    });

    return foundId;
  }

  /**
   * Parses all semester-looking folder entries from the AIS document-server
   * page. Returns them sorted most-recent-first.
   */
  parseAvailableSemesters(html: string): ParsedSemesterFolder[] {
    const $ = cheerio.load(html);
    const results: ParsedSemesterFolder[] = [];
    const seen = new Set<string>();

    $('a[href*="slozka.pl"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const idMatch = href.match(/id=(\d+)/);
      if (!idMatch) return;

      const id = idMatch[1];
      if (seen.has(id)) return;

      const linkText = this.normalizeText($(el).text());
      if (!linkText) return;

      if (!this.isStrictSemesterLabel(linkText)) return;

      seen.add(id);
      results.push({ id, label: linkText });
    });

    results.sort((a, b) => {
      const yA = a.label.match(/(20\d{2})\/(20\d{2})/);
      const yB = b.label.match(/(20\d{2})\/(20\d{2})/);

      if (yA && yB) {
        const endYearA = parseInt(yA[2], 10);
        const endYearB = parseInt(yB[2], 10);

        if (endYearA !== endYearB) return endYearB - endYearA;

        return this.seasonRank(b.label) - this.seasonRank(a.label);
      }

      return 0;
    });

    return results;
  }

  // ─── Subject folder parsing ────────────────────────────────────────────────

  /**
   * Parses subject sub-folders from a semester folder page.
   *
   * Only include rows whose title begins with a valid STU subject code.
   * That filters out structural folders such as "Strom".
   */
  parseSubjectFoldersFromSemesterFolderHtml(
    html: string,
  ): ParsedSubjectFolder[] {
    const $ = cheerio.load(html);
    const results: ParsedSubjectFolder[] = [];
    const seen = new Set<string>();
    const debug = this.isDebugTreeEnabled();

    const STU_CODE_RE = /^([A-Z][A-Z0-9]*-[A-Z0-9][A-Z0-9-]*)\s*(.*)$/u;

    $('table tr').each((_, row) => {
      const $row = $(row);

      if ($row.find('th').length > 0 && $row.find('td').length === 0) return;

      const $folderLink = $row.find('a[href*="slozka.pl"]').last();
      const href = $folderLink.attr('href') ?? '';
      const idMatch = href.match(/id=(\d+)/);
      if (!idMatch) return;

      const aisSubjectId = idMatch[1];
      if (!aisSubjectId || seen.has(aisSubjectId)) return;

      const cells = $row.find('td');
      let rawTitle = '';

      if (cells.length >= 2) {
        rawTitle = this.normalizeText(cells.eq(1).text());
      }
      if (!rawTitle && cells.length >= 1) {
        rawTitle = this.normalizeText(cells.eq(0).text());
      }
      if (!rawTitle) {
        rawTitle = this.normalizeText($folderLink.text());
      }
      if (!rawTitle) {
        rawTitle = this.normalizeText($row.text());
      }

      if (!rawTitle) return;

      const codeMatch = rawTitle.match(STU_CODE_RE);

      if (!codeMatch) {
        if (debug) {
          console.log(
            `AIS SUBJECT PARSER: skipping folder id=${aisSubjectId} ` +
            `(title="${rawTitle}" — no STU code pattern match)`,
          );
        }
        return;
      }

      const code = codeMatch[1].trim();
      const name = codeMatch[2]?.trim() || null;

      seen.add(aisSubjectId);

      results.push({
        aisSubjectId,
        code,
        name,
        sourceUrl: href.startsWith('http')
          ? href
          : `${this.baseUrl}/auth/dok_server/${href.replace(/^\/+/, '')}`,
      });
    });

    if (results.length === 0 && debug) {
      const allFolderLinks = $('a[href*="slozka.pl"]').length;
      console.warn(
        `AIS SUBJECT PARSER: 0 subjects found. ` +
        `Total slozka.pl links in page: ${allFolderLinks}. ` +
        `HTML snippet (first 800 chars): ${html.slice(0, 800)}`,
      );
    }

    return results;
  }

  // ─── Folder pagination ─────────────────────────────────────────────────────

  parseFolderPageIndexes(html: string, folderId: string): number[] {
    const $ = cheerio.load(html);
    const indexes = new Set<number>([0]);

    $('a[href*="typ=mod"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (!href.includes(`id=${folderId}`)) return;

      const match = href.match(/typ=mod;on=(-?\d+)/);
      if (!match) return;

      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0) {
        indexes.add(value);
      }
    });

    return Array.from(indexes).sort((a, b) => a - b);
  }

  // ─── Document parsing ──────────────────────────────────────────────────────

  parseDocumentsFromFolderHtml(
    html: string,
    folderId: string,
  ): ParsedFolderDocument[] {
    const $ = cheerio.load(html);
    const results: ParsedFolderDocument[] = [];
    const seen = new Set<string>();

    $('a[href*="download="]').each((_, el) => {
      const hrefRaw = $(el).attr('href') ?? '';
      const docIdMatch = hrefRaw.match(/download=(\d+)/);

      if (!docIdMatch) return;

      const externalDocId = docIdMatch[1];
      if (!externalDocId || seen.has(externalDocId)) return;

      seen.add(externalDocId);

      const row = $(el).closest('tr');
      const cells = row.find('td');

      const secondCellText = this.normalizeText(cells.eq(1).text()) || '';
      const rowText = this.normalizeText(row.text());

      let filename = '';
      if (secondCellText) {
        filename = secondCellText;
      } else if (rowText) {
        filename = rowText;
      } else {
        filename = `AIS document ${externalDocId}`;
      }

      const enteredBy = this.normalizeText(cells.eq(3).text()) || null;
      const documentDate = this.normalizeText(cells.eq(4).text()) || null;

      // Build the canonical download URL from the actual href attribute,
      // preserving the real folder id embedded in the link.
      let sourceUrl: string;
      if (hrefRaw.startsWith('http')) {
        sourceUrl = hrefRaw;
      } else if (hrefRaw.startsWith('/')) {
        sourceUrl = `${this.baseUrl}${hrefRaw}`;
      } else {
        sourceUrl = `${this.baseUrl}/auth/dok_server/${hrefRaw}`;
      }

      results.push({
        externalDocId,
        filename,
        sourceUrl,
        enteredBy,
        documentDate,
      });
    });

    return results;
  }
}
