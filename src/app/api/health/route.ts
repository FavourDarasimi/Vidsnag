import { NextResponse } from 'next/server';
import { checkSystemDependencies } from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const deps = await checkSystemDependencies();
  return NextResponse.json({
    status: deps.allSatisfied ? 'healthy' : 'degraded',
    dependencies: deps,
  });
}
