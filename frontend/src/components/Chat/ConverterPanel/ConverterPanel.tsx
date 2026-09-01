import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  Field,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tab,
  TabList,
  Text,
  Textarea,
} from '@fluentui/react-components'
import { DismissRegular, PlayRegular } from '@fluentui/react-icons'

import CreateConverterDialog from '@/components/Registry/CreateConverterDialog'
import { convertersApi } from '@/services/api'
import { toApiError } from '@/services/errors'
import type { ConverterInstance, ConverterPreviewResponse } from '@/types'

import type { PieceConversion } from '../converterTypes'
import { PIECE_TYPE_TO_DATA_TYPE } from '../converterTypes'
import { useConverterPanelStyles } from './ConverterPanel.styles'
import SelectConverterInput from './SelectConverterInput'

const PIECE_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
}

interface ConverterPanelProps {
  onClose: () => void
  previewText?: string
  attachmentData?: Record<string, string>
  activeInputTypes?: string[]
  onUseConvertedValue?: (conversion: PieceConversion) => void
}

export default function ConverterPanel({
  onClose,
  previewText = '',
  attachmentData = {},
  activeInputTypes = ['text'],
  onUseConvertedValue,
}: ConverterPanelProps) {
  const styles = useConverterPanelStyles()
  const [converters, setConverters] = useState<ConverterInstance[]>([])
  const [activeTab, setActiveTab] = useState('text')
  const [selectedConverterIds, setSelectedConverterIds] = useState<string[]>([])
  const [previewResult, setPreviewResult] = useState<{
    converterIds: string[]
    inputValue: string
    pieceType: string
    response: ConverterPreviewResponse
  } | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(800)
  const isDragging = useRef(false)

  const loadConverters = useCallback(async (selectId?: string) => {
    setIsLoading(true)
    try {
      const response = await convertersApi.listConverters()
      setConverters(response.items)
      setError(null)
      const availableIds = new Set(response.items.map((converter) => converter.converter_id))
      setSelectedConverterIds((current) => current.filter((converterId) => availableIds.has(converterId)))
      if (selectId) {
        const created = response.items.find((converter) => converter.converter_id === selectId)
        if (created) {
          setSelectedConverterIds((current) => [...current, created.converter_id])
        }
      }
    } catch (err) {
      setConverters([])
      setSelectedConverterIds([])
      setError(toApiError(err).detail)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConverters()
  }, [loadConverters])

  const tabs = useMemo(() => {
    const seen = new Set(['text'])
    const result = ['text']
    for (const inputType of activeInputTypes) {
      if (!seen.has(inputType)) {
        result.push(inputType)
        seen.add(inputType)
      }
    }
    return result
  }, [activeInputTypes])

  const effectiveActiveTab = tabs.includes(activeTab) ? activeTab : 'text'
  const activeDataType = PIECE_TYPE_TO_DATA_TYPE[effectiveActiveTab] ?? 'text'
  const selectedConverters = useMemo(
    () => selectedConverterIds
      .map((converterId) => converters.find((converter) => converter.converter_id === converterId))
      .filter((converter): converter is ConverterInstance => converter !== undefined),
    [converters, selectedConverterIds],
  )
  const lastSelectedConverter = selectedConverters[selectedConverters.length - 1]
  const nextInputType = lastSelectedConverter?.identifier.supported_output_types?.[0] ?? activeDataType

  const filteredConverters = useMemo(() => {
    const filtered = converters.filter((converter) => {
      const supported = converter.identifier.supported_input_types ?? []
      return supported.length === 0 || supported.includes(nextInputType)
    })
    return filtered
  }, [converters, nextInputType])

  const groupedConverters = useMemo(() => {
    const groups: Record<string, ConverterInstance[]> = {}
    const order = ['text', 'image_path', 'audio_path', 'video_path', 'binary_path']
    for (const converter of filteredConverters) {
      const outputType = converter.identifier.supported_output_types?.[0] ?? 'text'
      if (!groups[outputType]) groups[outputType] = []
      groups[outputType].push(converter)
    }
    const unknownTypes = Object.keys(groups).filter((type) => !order.includes(type))
    return [...order, ...unknownTypes]
      .filter((type) => groups[type]?.length)
      .map((type) => ({ type, converters: groups[type] }))
  }, [filteredConverters])

  const resetPreview = useCallback(() => {
    setPreviewResult(null)
    setPreviewError(null)
  }, [])

  const handleTabSelect = useCallback((_: unknown, data: { value: unknown }) => {
    setActiveTab(String(data.value))
    setSelectedConverterIds([])
    resetPreview()
  }, [resetPreview])

  const handleConverterSelect = useCallback((converterId: string) => {
    setSelectedConverterIds((current) => [...current, converterId])
    resetPreview()
  }, [resetPreview])

  const removeConverter = useCallback((index: number) => {
    setSelectedConverterIds((current) => current.filter((_, currentIndex) => currentIndex !== index))
    resetPreview()
  }, [resetPreview])

  const handlePreview = useCallback(async () => {
    const previewValue = effectiveActiveTab === 'text'
      ? previewText
      : (attachmentData[effectiveActiveTab] ?? '')
    if (selectedConverterIds.length === 0 || !previewValue.trim()) return

    setIsPreviewing(true)
    setPreviewError(null)
    setPreviewResult(null)
    try {
      const response = await convertersApi.previewConversion({
        original_value: previewValue,
        converter_ids: selectedConverterIds,
        original_value_data_type: activeDataType,
      })
      setPreviewResult({
        converterIds: [...selectedConverterIds],
        inputValue: previewValue,
        pieceType: effectiveActiveTab,
        response,
      })
    } catch (err) {
      setPreviewError(toApiError(err).detail)
    } finally {
      setIsPreviewing(false)
    }
  }, [
    activeDataType,
    attachmentData,
    effectiveActiveTab,
    previewText,
    selectedConverterIds,
  ])

  const currentInput = effectiveActiveTab === 'text'
    ? previewText
    : (attachmentData[effectiveActiveTab] ?? '')
  const previewResponse = previewResult?.inputValue === currentInput
    && previewResult.pieceType === effectiveActiveTab
    && previewResult.converterIds.length === selectedConverterIds.length
    && previewResult.converterIds.every(
      (converterId, index) => converterId === selectedConverterIds[index],
    )
    ? previewResult.response
    : null

  const handleUseConvertedValue = useCallback(() => {
    if (!previewResponse || selectedConverterIds.length === 0 || !onUseConvertedValue) return

    onUseConvertedValue({
      pieceType: effectiveActiveTab,
      converterInstanceIds: selectedConverterIds,
      convertedValue: previewResponse.converted_value,
      originalValue: currentInput,
      convertedDataType: previewResponse.converted_value_data_type,
    })
  }, [
    currentInput,
    effectiveActiveTab,
    onUseConvertedValue,
    previewResponse,
    selectedConverterIds,
  ])

  const handleMouseDown = useCallback(() => {
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) return
      setPanelWidth(Math.max(480, Math.min(1200, event.clientX)))
    }
    const handleMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div className={styles.resizeContainer} style={{ width: panelWidth }}>
      <aside className={styles.root} data-testid="converter-panel">
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Text weight="semibold" size={300}>Converters</Text>
            <Text size={200} className={styles.hintText}>
              Build and preview a registered converter pipeline.
            </Text>
          </div>
          <Button
            appearance="subtle"
            size="small"
            icon={<DismissRegular />}
            onClick={onClose}
            className={styles.touchTarget}
            aria-label="Close converters"
            data-testid="close-converter-panel-btn"
          />
        </div>
        {tabs.length > 1 && (
          <TabList
            selectedValue={effectiveActiveTab}
            onTabSelect={handleTabSelect}
            size="small"
            className={styles.tabBar}
            data-testid="converter-piece-tabs"
          >
            {tabs.map((tab) => (
              <Tab key={tab} value={tab} data-testid={`converter-tab-${tab}`}>
                {PIECE_TYPE_LABELS[tab] ?? tab}
              </Tab>
            ))}
          </TabList>
        )}
        <div className={styles.body}>
          <Field
            label="Input"
            hint="Read only. This value mirrors the current chat input."
            className={styles.inputSection}
          >
            <Textarea
              readOnly
              resize="vertical"
              value={currentInput}
              placeholder={
                effectiveActiveTab === 'text'
                  ? 'Enter a prompt in the chat input.'
                  : `Attach a ${effectiveActiveTab} file in the chat input.`
              }
              data-testid="converter-input-value"
            />
          </Field>
          {isLoading && (
            <div className={styles.loading} data-testid="converter-panel-loading">
              <Spinner size="tiny" />
            </div>
          )}
          {!isLoading && error && (
            <MessageBar intent="error" data-testid="converter-panel-error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}
          {!isLoading && !error && (
            <div className={styles.converterList} data-testid="converter-panel-list">
              <SelectConverterInput
                groupedConverters={groupedConverters}
                onOptionSelect={handleConverterSelect}
                onCreateNew={() => setCreateDialogOpen(true)}
              />
              {selectedConverters.length > 0 && (
                <Button
                  appearance="primary"
                  size="small"
                  icon={isPreviewing ? <Spinner size="tiny" /> : <PlayRegular />}
                  onClick={() => void handlePreview()}
                  disabled={isPreviewing || !currentInput.trim()}
                  className={styles.previewButton}
                  data-testid="converter-preview-btn"
                >
                  {isPreviewing ? 'Converting...' : 'Preview'}
                </Button>
              )}
              {previewError && (
                <MessageBar intent="error" data-testid="converter-preview-error">
                  <MessageBarBody className={styles.errorBody}>{previewError}</MessageBarBody>
                </MessageBar>
              )}
              {selectedConverters.map((converter, index) => (
                <div
                  key={`${converter.converter_id}-${index}`}
                  className={styles.converterCard}
                  data-testid={`converter-item-${converter.converter_id}`}
                >
                  <div className={styles.converterCardHeader}>
                    <Text weight="semibold" size={300} className={styles.converterName}>
                      {index + 1}. {converter.converter_id}
                    </Text>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<DismissRegular />}
                      aria-label={`Remove converter ${converter.converter_id} at position ${index + 1}`}
                      onClick={() => removeConverter(index)}
                    />
                  </div>
                  <Text size={200} className={styles.hintText}>
                    {converter.identifier.class_name}
                    {converter.is_llm_based && <span className={styles.llmBadge}>LLM</span>}
                  </Text>
                  <Text size={200} className={styles.hintText}>
                    {converter.description || 'No description is available.'}
                  </Text>
                  <Field
                    label={`Output after ${converter.converter_id}`}
                    hint={
                      previewResponse
                        ? `Read only - ${previewResponse.steps[index]?.output_data_type ?? 'unknown type'}`
                        : 'Read only'
                    }
                    className={styles.stageOutput}
                    data-testid={`converter-stage-output-${index}`}
                  >
                    <Textarea
                      readOnly
                      resize="vertical"
                      value={previewResponse?.steps[index]?.output_value ?? ''}
                      placeholder={
                        previewResponse
                          ? 'This stage returned an empty value.'
                          : 'Run Preview to see this stage output.'
                      }
                      data-testid={
                        previewResponse && index === selectedConverters.length - 1
                          ? 'converter-preview-result'
                          : undefined
                      }
                    />
                  </Field>
                </div>
              ))}
              <Button
                appearance="primary"
                onClick={handleUseConvertedValue}
                disabled={!previewResponse || !onUseConvertedValue}
                className={styles.addConvertedButton}
                data-testid="use-converted-btn"
              >
                Add converted value
              </Button>
            </div>
          )}
        </div>
      </aside>
      <div
        className={styles.resizeHandle}
        onMouseDown={handleMouseDown}
        data-testid="converter-panel-resize"
      />
      <CreateConverterDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={(converterId) => {
          setCreateDialogOpen(false)
          void loadConverters(converterId)
        }}
      />
    </div>
  )
}
