import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FluentProvider, webLightTheme } from '@fluentui/react-components'

import { convertersApi } from '@/services/api'

import ConverterRegistry from './ConverterRegistry'

jest.mock('@/services/api', () => ({
  convertersApi: {
    listConverters: jest.fn(),
    deleteConverter: jest.fn(),
  },
}))

jest.mock('./CreateConverterDialog', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => open ? <div role="dialog">Create converter</div> : null,
}))

const mockedConvertersApi = convertersApi as jest.Mocked<typeof convertersApi>
const converter = {
  converter_id: 'base64-default',
  identifier: {
    class_name: 'Base64Converter',
    class_module: 'pyrit.converter.Base64Converter',
    hash: 'hash',
    pyrit_version: '0.0.0',
    supported_input_types: ['text'],
    supported_output_types: ['text'],
    encoding_func: 'b64encode',
  },
  is_llm_based: false,
}

function renderRegistry() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ConverterRegistry />
    </FluentProvider>,
  )
}

describe('ConverterRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedConvertersApi.listConverters.mockResolvedValue({ items: [converter] })
    mockedConvertersApi.deleteConverter.mockResolvedValue()
  })

  it('lists registered converter instances and configuration', async () => {
    renderRegistry()

    expect(await screen.findByText('base64-default')).toBeInTheDocument()
    expect(screen.getByText('Base64Converter')).toBeInTheDocument()
    expect(screen.getByText('encoding_func: b64encode')).toBeInTheDocument()
  })

  it('opens the shared create dialog', async () => {
    const user = userEvent.setup()
    renderRegistry()
    await screen.findByText('base64-default')

    await user.click(screen.getByRole('button', { name: 'New Converter' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Create converter')
  })

  it('confirms removal and refreshes the registry', async () => {
    mockedConvertersApi.listConverters
      .mockResolvedValueOnce({ items: [converter] })
      .mockResolvedValueOnce({ items: [] })
    const user = userEvent.setup()
    renderRegistry()
    await screen.findByText('base64-default')

    await user.click(screen.getByRole('button', { name: 'Remove base64-default' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(mockedConvertersApi.deleteConverter).toHaveBeenCalledWith('base64-default')
    expect(await screen.findByText('No Converters Registered')).toBeInTheDocument()
  })
})
