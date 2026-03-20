import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import type { CameraType } from 'expo-camera'
import { CameraView } from 'expo-camera'
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

type StepState = 'done' | 'pending' | 'idle'

type CameraNotice = {
  level: 'success' | 'error' | 'info'
  title: string
  message: string
}

type ChecklistItem = {
  label: string
  done: boolean
  pending: boolean
}

type CameraScreenViewProps = {
  notice: CameraNotice | null
  insetTop: number
  noticeSlideX: Animated.Value
  dismissNotice: () => void
  isPreviewing: boolean
  isFocused: boolean
  cameraSessionKey: number
  cameraRef: React.RefObject<any>
  facing: CameraType
  onCameraReady: () => void
  onToggleCameraFacing: () => void
  onTakePicture: () => void
  isReady: boolean
  isTaking: boolean
  isSubmitting: boolean
  previewUri: string | null
  captureChecklist: ChecklistItem[]
  submitChecklist: ChecklistItem[]
  hasSubmitProgress: boolean
  timestampIso: string | null
  previewH3Cell: string | null
  h3Resolution: number
  onDiscard: () => void
  onSubmit: () => void
}

function getStepState(done: boolean, pending: boolean): StepState {
  if (done) return 'done'
  if (pending) return 'pending'
  return 'idle'
}

function getStepIconName(state: StepState): keyof typeof MaterialIcons.glyphMap {
  if (state === 'done') return 'check-circle'
  if (state === 'pending') return 'hourglass-top'
  return 'radio-button-unchecked'
}

function getStepIconColor(state: StepState): string {
  if (state === 'done') return '#66f5c5'
  if (state === 'pending') return '#ffd66a'
  return '#89a3c2'
}

function getNoticeColorStyle(level: CameraNotice['level']): object {
  if (level === 'success') return styles.noticeSuccess
  if (level === 'error') return styles.noticeError
  return styles.noticeInfo
}

function NoticeBanner(props: {
  notice: CameraNotice
  insetTop: number
  noticeSlideX: Animated.Value
  dismissNotice: () => void
}) {
  return (
    <Animated.View
      style={[
        styles.noticeWrap,
        { top: props.insetTop + 8, transform: [{ translateX: props.noticeSlideX }] },
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.noticeCard, getNoticeColorStyle(props.notice.level)]}>
        <View style={styles.noticeHeader}>
          <Text style={styles.noticeTitle} numberOfLines={1}>
            {props.notice.title}
          </Text>
          <Pressable onPress={props.dismissNotice} hitSlop={8}>
            <MaterialIcons name="chevron-right" size={18} color="#d8e5f9" />
          </Pressable>
        </View>
        <Text style={styles.noticeMessage} numberOfLines={3}>
          {props.notice.message}
        </Text>
      </View>
    </Animated.View>
  )
}

function CaptureStage(props: {
  isFocused: boolean
  cameraSessionKey: number
  cameraRef: React.RefObject<any>
  facing: CameraType
  onCameraReady: () => void
  onToggleCameraFacing: () => void
  onTakePicture: () => void
  isReady: boolean
  isTaking: boolean
  isSubmitting: boolean
}) {
  return (
    <>
      {props.isFocused ? (
        <CameraView
          key={props.cameraSessionKey}
          ref={props.cameraRef}
          style={styles.camera}
          facing={props.facing}
          onCameraReady={props.onCameraReady}
        />
      ) : (
        <View style={styles.camera} />
      )}

      <LinearGradient
        colors={['rgba(10,15,20,0)', 'rgba(10,15,20,0.95)']}
        style={styles.bottomOverlay}
        pointerEvents="box-none"
      >
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={props.onToggleCameraFacing} style={styles.roundControl}>
            <Text style={styles.roundControlText}>Flip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={props.onTakePicture}
            disabled={!props.isReady || props.isTaking || props.isSubmitting}
            style={styles.captureOuter}
          >
            <View
              style={[
                styles.captureInner,
                (!props.isReady || props.isTaking || props.isSubmitting) && styles.captureInnerDisabled,
              ]}
            />
          </TouchableOpacity>

          <View style={styles.controlSpacer} />
        </View>
      </LinearGradient>
    </>
  )
}

function ChecklistCard(props: { title: string; items: ChecklistItem[] }) {
  return (
    <View style={styles.checklistCard}>
      <Text style={styles.checklistTitle}>{props.title}</Text>
      {props.items.map((step) => {
        const state = getStepState(step.done, step.pending)
        return (
          <View key={step.label} style={styles.checklistRow}>
            <MaterialIcons name={getStepIconName(state)} size={17} color={getStepIconColor(state)} />
            <Text style={styles.checklistText}>{step.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

function PreviewStage(props: {
  previewUri: string | null
  captureChecklist: ChecklistItem[]
  submitChecklist: ChecklistItem[]
  hasSubmitProgress: boolean
  timestampIso: string | null
  previewH3Cell: string | null
  h3Resolution: number
  isSubmitting: boolean
  onDiscard: () => void
  onSubmit: () => void
}) {
  return (
    <View style={styles.previewContainer}>
      {!!props.previewUri && <Image source={{ uri: props.previewUri }} style={styles.previewImage} contentFit="cover" />}

      <LinearGradient colors={['rgba(7,10,14,0.70)', 'transparent']} style={styles.previewTopOverlay}>
        <Text style={styles.previewTitle}>Review Proof</Text>
        <Text style={styles.previewSubtitle}>Finalize and send to Solana devnet</Text>
      </LinearGradient>

      <LinearGradient colors={['transparent', 'rgba(7,10,14,0.94)']} style={styles.previewBottomOverlay}>
        <View style={styles.previewPanel}>
          <ChecklistCard title="Verification Steps" items={props.captureChecklist} />

          {props.isSubmitting || props.hasSubmitProgress ? (
            <ChecklistCard title="Submit Steps" items={props.submitChecklist} />
          ) : null}

          <View style={styles.metaGrid}>
            <View style={[styles.metaRow, styles.metaHalf]}>
              <Text style={styles.metaLabel}>Timestamp</Text>
              <Text style={styles.metaValue} numberOfLines={2}>
                {props.timestampIso ?? 'Resolving from chain...'}
              </Text>
            </View>

            <View style={[styles.metaRow, styles.metaHalf]}>
              <Text style={styles.metaLabel}>H3 Cell</Text>
              <Text style={styles.metaValue} numberOfLines={2}>
                {props.previewH3Cell ? `${props.previewH3Cell} (r${props.h3Resolution})` : 'Requires location permission'}
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable style={[styles.actionButton, styles.secondaryButton]} onPress={props.onDiscard} disabled={props.isSubmitting}>
              <Text style={styles.secondaryButtonText}>Retake</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.primaryButton, props.isSubmitting && styles.primaryButtonBusy]}
              onPress={props.onSubmit}
              disabled={props.isSubmitting}
            >
              {props.isSubmitting ? (
                <View style={styles.submitBusyRow}>
                  <ActivityIndicator size="small" color="#061219" />
                  <Text style={styles.primaryButtonText}>Submitting</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Submit Proof</Text>
              )}
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </View>
  )
}

export function CameraScreenView(props: CameraScreenViewProps) {
  return (
    <View style={styles.container}>
      {props.notice ? (
        <NoticeBanner
          notice={props.notice}
          insetTop={props.insetTop}
          noticeSlideX={props.noticeSlideX}
          dismissNotice={props.dismissNotice}
        />
      ) : null}

      {!props.isPreviewing ? (
        <CaptureStage
          isFocused={props.isFocused}
          cameraSessionKey={props.cameraSessionKey}
          cameraRef={props.cameraRef}
          facing={props.facing}
          onCameraReady={props.onCameraReady}
          onToggleCameraFacing={props.onToggleCameraFacing}
          onTakePicture={props.onTakePicture}
          isReady={props.isReady}
          isTaking={props.isTaking}
          isSubmitting={props.isSubmitting}
        />
      ) : (
        <PreviewStage
          previewUri={props.previewUri}
          captureChecklist={props.captureChecklist}
          submitChecklist={props.submitChecklist}
          hasSubmitProgress={props.hasSubmitProgress}
          timestampIso={props.timestampIso}
          previewH3Cell={props.previewH3Cell}
          h3Resolution={props.h3Resolution}
          isSubmitting={props.isSubmitting}
          onDiscard={props.onDiscard}
          onSubmit={props.onSubmit}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05090e',
  },
  noticeWrap: {
    position: 'absolute',
    right: 10,
    width: 280,
    zIndex: 50,
  },
  noticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  noticeSuccess: {
    backgroundColor: 'rgba(14, 50, 37, 0.96)',
    borderColor: 'rgba(102, 245, 197, 0.58)',
  },
  noticeError: {
    backgroundColor: 'rgba(67, 14, 24, 0.96)',
    borderColor: 'rgba(255, 122, 144, 0.58)',
  },
  noticeInfo: {
    backgroundColor: 'rgba(17, 32, 51, 0.96)',
    borderColor: 'rgba(145, 173, 206, 0.58)',
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  noticeTitle: {
    color: '#eef5ff',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  noticeMessage: {
    color: '#d8e5f9',
    fontSize: 12,
    lineHeight: 16,
  },
  camera: {
    flex: 1,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 80,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundControl: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: 'rgba(236, 244, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(238, 244, 255, 0.28)',
  },
  roundControlText: {
    color: '#e8f2ff',
    fontWeight: '600',
    fontSize: 14,
  },
  captureOuter: {
    width: 98,
    height: 98,
    borderRadius: 999,
    borderWidth: 5,
    borderColor: '#eef4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 78,
    height: 78,
    borderRadius: 999,
    backgroundColor: '#66f5c5',
  },
  captureInnerDisabled: {
    opacity: 0.45,
  },
  controlSpacer: {
    width: 64,
    height: 64,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#05090e',
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  previewTopOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  previewTitle: {
    color: '#f4f8ff',
    fontSize: 28,
    fontWeight: '800',
  },
  previewSubtitle: {
    color: '#ccd8ea',
    fontSize: 13,
    marginTop: 4,
  },
  previewBottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 80,
    paddingBottom: 22,
  },
  previewPanel: {
    borderRadius: 18,
    backgroundColor: 'rgba(7, 13, 24, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(175, 194, 222, 0.2)',
    padding: 12,
    gap: 10,
  },
  checklistCard: {
    borderRadius: 10,
    backgroundColor: 'rgba(7, 17, 29, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(175, 194, 222, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  checklistTitle: {
    color: '#d7e7ff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(12, 24, 40, 0.34)',
  },
  checklistText: {
    color: '#eef4ff',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metaHalf: {
    flex: 1,
  },
  metaRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(7, 17, 29, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(175, 194, 222, 0.22)',
    gap: 3,
  },
  metaLabel: {
    color: '#adc0dc',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: '#f4f8ff',
    fontSize: 13,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(233, 241, 255, 0.48)',
    backgroundColor: 'rgba(12, 23, 36, 0.60)',
  },
  secondaryButtonText: {
    color: '#eff5ff',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#66f5c5',
  },
  primaryButtonBusy: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: '#061219',
    fontSize: 15,
    fontWeight: '800',
  },
  submitBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
