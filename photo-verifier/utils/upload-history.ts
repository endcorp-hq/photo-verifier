import AsyncStorage from '@react-native-async-storage/async-storage'

const UPLOAD_HISTORY_KEY = 'photo_verifier_upload_history_v1'
const MAX_HISTORY_ITEMS = 250

export type UploadHistoryRecord = {
  id: string
  createdAtIso: string
  clusterNetwork: string
  timestampSec: number
  slot: number
  blockhash: string
  wallet: string
  seekerMint: string
  hashHex: string
  h3Cell: string
  h3Resolution: number
  txSignature: string
  nonce: string
  remoteUri: string
  localUri: string | null
}

function coerceHistory(value: unknown): UploadHistoryRecord[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): UploadHistoryRecord | null => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<UploadHistoryRecord>
      if (
        typeof row.id !== 'string' ||
        typeof row.createdAtIso !== 'string' ||
        typeof row.txSignature !== 'string' ||
        typeof row.remoteUri !== 'string'
      ) {
        return null
      }
      return {
        ...(row as UploadHistoryRecord),
        // Legacy records (before per-record cluster tracking) default to devnet.
        clusterNetwork: typeof row.clusterNetwork === 'string' && row.clusterNetwork.length > 0 ? row.clusterNetwork : 'devnet',
      }
    })
    .filter((item): item is UploadHistoryRecord => {
      return (
        !!item &&
        typeof item.id === 'string' &&
        typeof item.createdAtIso === 'string' &&
        typeof item.txSignature === 'string' &&
        typeof item.remoteUri === 'string'
      )
    })
    .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))
    .slice(0, MAX_HISTORY_ITEMS)
}

export async function listUploadHistory(): Promise<UploadHistoryRecord[]> {
  const raw = await AsyncStorage.getItem(UPLOAD_HISTORY_KEY)
  if (!raw) return []
  try {
    return coerceHistory(JSON.parse(raw))
  } catch {
    return []
  }
}

export async function saveUploadHistoryRecord(
  record: Omit<UploadHistoryRecord, 'id' | 'createdAtIso'>,
): Promise<UploadHistoryRecord> {
  const existing = await listUploadHistory()
  const next: UploadHistoryRecord = {
    id: `${Date.now()}-${record.hashHex.slice(0, 10)}`,
    createdAtIso: new Date().toISOString(),
    ...record,
  }
  const merged = [next, ...existing].slice(0, MAX_HISTORY_ITEMS)
  await AsyncStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(merged))
  return next
}

export async function deleteUploadHistoryRecord(id: string): Promise<void> {
  const existing = await listUploadHistory()
  const next = existing.filter(item => item.id !== id)
  await AsyncStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(next))
}

export async function clearUploadHistory(): Promise<void> {
  await AsyncStorage.removeItem(UPLOAD_HISTORY_KEY)
}
