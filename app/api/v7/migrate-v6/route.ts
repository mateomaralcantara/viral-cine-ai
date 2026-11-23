import { NextResponse } from 'next/server';
import { listProjects } from '@/lib/storage/project-store';
import { migrateV6CatalogToV7 } from '@/lib/v7/migration/migrate-v6-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({
    ok: true,
    legacyProjects: projects.map((project) => ({
      id: project.id,
      title: project.input.title,
      status: project.status,
      hasPlan: Boolean(project.plan),
      hasFinalMaster: Boolean(project.finalVideoAsset)
    })),
    total: projects.length,
    externalApis: false,
    apiCostUsd: 0
  });
}

export async function POST() {
  try {
    const result = await migrateV6CatalogToV7();
    return NextResponse.json({
      ok: result.failed.length === 0,
      ...result,
      externalApis: false,
      apiCostUsd: 0
    }, { status: result.failed.length ? 207 : 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
