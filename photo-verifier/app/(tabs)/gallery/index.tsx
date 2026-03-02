import * as FileSystem from 'expo-file-system'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Snackbar from 'react-native-snackbar'
import { useCluster } from '@/components/cluster/cluster-provider'
import {
  deleteUploadHistoryRecord,
  listUploadHistory,
  type UploadHistoryRecord,
} from '@/utils/upload-history'

function formatProofDate(timestampSec: number): string {
  try {
    return new Date(timestampSec * 1000).toLocaleString()
  } catch {
    return 'Unknown time'
  }
}

export default function GalleryTabScreen() {
  const [records, setRecords] = useState<UploadHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { selectedCluster } = useCluster()

  const loadRecords = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const items = await listUploadHistory()
      // Gallery only shows completed proofs with wallet signature + tx signature.
      setRecords(items.filter(item => !!item.txSignature && !!item.hashHex && !!item.wallet))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadRecords(true)
    }, [loadRecords]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadRecords(false)
  }, [loadRecords])

  const emptyMessage = useMemo(() => {
    if (loading) return ''
    return 'No signed proofs yet. Capture and submit from Camera to populate this gallery.'
  }, [loading])

  const handleDelete = useCallback(async (record: UploadHistoryRecord) => {
    try {
      await deleteUploadHistoryRecord(record.id)
      if (record.localUri) {
        await FileSystem.deleteAsync(record.localUri, { idempotent: true }).catch(() => undefined)
      }
      setRecords(prev => prev.filter(item => item.id !== record.id))
      Snackbar.show({
        text: 'Removed from gallery',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'rgba(33,33,33,0.95)',
        textColor: 'white',
      })
    } catch (e: any) {
      Snackbar.show({
        text: `Delete failed: ${e?.message ?? 'unknown error'}`,
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'rgba(176,0,32,0.95)',
        textColor: 'white',
      })
    }
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: UploadHistoryRecord }) => {
      const photoUri = item.localUri || item.remoteUri
      const txUrl = `https://solscan.io/tx/${item.txSignature}?cluster=${selectedCluster.network}`
      const latitude = (item.latitudeE6 / 1_000_000).toFixed(5)
      const longitude = (item.longitudeE6 / 1_000_000).toFixed(5)
      return (
        <View style={styles.card}>
          <View style={styles.imageWrap}>
            <Image source={{ uri: photoUri }} style={styles.image} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(6,12,24,0.88)']} style={styles.imageFooter}>
              <Text style={styles.imageFooterText}>{formatProofDate(item.timestampSec)}</Text>
            </LinearGradient>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.hashText}>Hash {item.hashHex.slice(0, 10)}...{item.hashHex.slice(-6)}</Text>
            <Text style={styles.metaText}>Slot {item.slot} • {selectedCluster.name}</Text>
            <Text style={styles.metaText}>Wallet {item.wallet.slice(0, 6)}...{item.wallet.slice(-6)}</Text>
            <Text style={styles.metaText}>Location {latitude}, {longitude}</Text>

            <View style={styles.actionsRow}>
              <Pressable style={[styles.smallButton, styles.txButton]} onPress={() => Linking.openURL(txUrl)}>
                <Text style={styles.txButtonText}>View Tx</Text>
              </Pressable>
              <Pressable style={[styles.smallButton, styles.deleteButton]} onPress={() => handleDelete(item)}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )
    },
    [handleDelete, selectedCluster.name, selectedCluster.network],
  )

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0b1320', '#071f2c', '#092f2f']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Text style={styles.title}>Proof Gallery</Text>
        <Text style={styles.subtitle}>Signed uploads from this device</Text>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#66f5c5" />
          <Text style={styles.loadingText}>Loading signed proofs...</Text>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#66f5c5" />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: {
    color: '#f0f6ff',
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 4,
    color: '#bdd1ea',
    fontSize: 13,
  },
  listContent: {
    padding: 12,
    paddingBottom: 28,
    gap: 14,
  },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(191, 207, 230, 0.30)',
    backgroundColor: 'rgba(9, 19, 34, 0.70)',
  },
  imageWrap: {
    height: 210,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  imageFooterText: {
    color: '#ecf4ff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardBody: {
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  hashText: {
    color: '#e6f0fd',
    fontSize: 12,
    fontWeight: '700',
  },
  metaText: {
    color: '#bdd1ea',
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txButton: {
    backgroundColor: '#66f5c5',
  },
  txButtonText: {
    color: '#061219',
    fontWeight: '700',
    fontSize: 13,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: 'rgba(248, 130, 146, 0.65)',
    backgroundColor: 'rgba(176, 0, 32, 0.22)',
  },
  deleteButtonText: {
    color: '#ffd3dc',
    fontSize: 13,
    fontWeight: '700',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  loadingText: {
    color: '#dce9fb',
    fontSize: 13,
  },
  emptyText: {
    color: '#dce9fb',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
})
