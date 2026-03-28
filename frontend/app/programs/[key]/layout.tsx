import type { Metadata } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

interface ProgramMeta {
  name_ru: string | null;
  name_en: string | null;
  cefr_level: string | null;
}

export async function generateStaticParams() {
  try {
    const data: Record<string, ProgramMeta> = await fetch(
      `${BACKEND_URL}/api/subcategory-meta`
    ).then((r) => (r.ok ? r.json() : {}));
    return [{ key: '_' }, ...Object.keys(data).map((k) => ({ key: k }))];
  } catch {
    return [{ key: '_' }];
  }
}

export async function generateMetadata({
  params,
}: {
  params: { key: string };
}): Promise<Metadata> {
  if (params.key === '_') return { title: 'Программы обучения литовскому' };
  try {
    const data: Record<string, ProgramMeta> = await fetch(
      `${BACKEND_URL}/api/subcategory-meta`
    ).then((r) => (r.ok ? r.json() : {}));
    const meta = data[params.key];
    if (!meta) return { title: 'Программа' };
    const nameRu = meta.name_ru ?? params.key;
    const nameEn = meta.name_en ?? params.key;
    const desc = meta.cefr_level
      ? `Программа изучения литовского языка уровня ${meta.cefr_level}. Тематические наборы слов и упражнения.`
      : 'Программа изучения литовского языка. Тематические наборы слов и упражнения.';
    return {
      title: nameRu,
      description: desc,
      alternates: {
        canonical: `https://fluent.lt/programs/${params.key}/`,
      },
      openGraph: {
        title: nameRu,
        description: desc,
        url: `https://fluent.lt/programs/${params.key}/`,
        locale: 'ru_RU',
        alternateLocale: 'en_US',
        images: [
          { url: '/og-default-ru.svg', width: 1200, height: 630, alt: nameRu },
          { url: '/og-default-en.svg', width: 1200, height: 630, alt: nameEn },
        ],
      },
    };
  } catch {
    return {};
  }
}

export default function ProgramDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
