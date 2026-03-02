import { NextResponse } from 'next/server';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const BUCKET = process.env.S3_BUCKET || 'photoverifier';
const REGION = process.env.S3_REGION || 'us-east-1';

const s3 = new S3Client({ region: REGION });

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const key = String(body?.key || '').trim();
    const deleteSidecar = body?.deleteSidecar !== false;

    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

    let sidecarDeleted = false;
    if (deleteSidecar) {
      const sidecarKey = key.replace(/\.[^.]+$/g, '.json');
      if (sidecarKey !== key) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: sidecarKey }));
        sidecarDeleted = true;
      }
    }

    return NextResponse.json({
      ok: true,
      bucket: BUCKET,
      key,
      sidecarDeleted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 });
  }
}

