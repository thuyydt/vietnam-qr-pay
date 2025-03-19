import { FieldID, QRProvider, VietQRConsumerFieldID, Consumer, AdditionalDataID, Provider, AdditionalData, QRProviderGUID, ProviderFieldID, Merchant, VietQRService, UnreservedFieldID, EVMCoFieldID } from './constants/qr-pay'
import { crc16ccitt } from './crc16'
export class QRPay {
  isValid = true
  version: string
  initMethod: string
  provider: Provider
  merchant: Merchant
  consumer: Consumer
  category?: string
  currency?: string
  amount?: string
  tipAndFeeType?: string
  tipAndFeeAmount?: string
  tipAndFeePercent?: string
  nation?: string
  city?: string
  zipCode?: string
  additionalData: AdditionalData
  crc?: string

  EVMCo?: Record<string, string>
  unreserved?: Record<string, string>

  constructor(content?: string) {
    this.provider = new Provider()
    this.consumer = new Consumer()
    this.merchant = new Merchant()
    this.additionalData = new AdditionalData()
    this.parse(content ?? '')
  }

  public parse(content: string): void {
    if (content.length < 4) return this.invalid()
    // verify CRC
    const crcValid = QRPay.verifyCRC(content)
    if (!crcValid) return this.invalid()
    // parse content
    this.parseRootContent(content)
  }

  public build(): string {
    const version = QRPay.genFieldData(FieldID.VERSION, this.version ?? '01')
    const initMethod = QRPay.genFieldData(FieldID.INIT_METHOD, this.initMethod ?? '11')

    const guid = QRPay.genFieldData(ProviderFieldID.GUID, this.provider.guid)

    let providerDataContent = ''
    if (this.provider.guid === QRProviderGUID.VIETQR) {
      const bankBin = QRPay.genFieldData(VietQRConsumerFieldID.BANK_BIN, this.consumer.bankBin)
      const bankNumber = QRPay.genFieldData(VietQRConsumerFieldID.BANK_NUMBER, this.consumer.bankNumber)
      providerDataContent = bankBin + bankNumber
    } else if (this.provider.guid === QRProviderGUID.VNPAY) {
      providerDataContent = this.merchant.id ?? ''
    } else {
      providerDataContent = this.provider.data ?? ''
    }
    const provider = QRPay.genFieldData(ProviderFieldID.DATA, providerDataContent)
    const service = QRPay.genFieldData(ProviderFieldID.SERVICE, this.provider.service)
    const providerData = QRPay.genFieldData(this.provider.fieldId, guid + provider + service)

    const category = QRPay.genFieldData(FieldID.CATEGORY, this.category)
    const currency = QRPay.genFieldData(FieldID.CURRENCY, this.currency ?? '704')
    const amountStr = QRPay.genFieldData(FieldID.AMOUNT, this.amount)
    const tipAndFeeType = QRPay.genFieldData(FieldID.TIP_AND_FEE_TYPE, this.tipAndFeeType)
    const tipAndFeeAmount = QRPay.genFieldData(FieldID.TIP_AND_FEE_AMOUNT, this.tipAndFeeAmount)
    const tipAndFeePercent = QRPay.genFieldData(FieldID.TIP_AND_FEE_PERCENT, this.tipAndFeePercent)
    const nation = QRPay.genFieldData(FieldID.NATION, this.nation ?? 'VN')
    const merchantName = QRPay.genFieldData(FieldID.MERCHANT_NAME, this.merchant.name)
    const city = QRPay.genFieldData(FieldID.CITY, this.city)
    const zipCode = QRPay.genFieldData(FieldID.ZIP_CODE, this.zipCode)

    const buildNumber = QRPay.genFieldData(AdditionalDataID.BILL_NUMBER, this.additionalData.billNumber)
    const mobileNumber = QRPay.genFieldData(AdditionalDataID.MOBILE_NUMBER, this.additionalData.mobileNumber)
    const storeLabel = QRPay.genFieldData(AdditionalDataID.STORE_LABEL, this.additionalData.store)
    const loyaltyNumber = QRPay.genFieldData(AdditionalDataID.LOYALTY_NUMBER, this.additionalData.loyaltyNumber)
    const reference = QRPay.genFieldData(AdditionalDataID.REFERENCE_LABEL, this.additionalData.reference)
    const customerLabel = QRPay.genFieldData(AdditionalDataID.CUSTOMER_LABEL, this.additionalData.customerLabel)
    const terminal = QRPay.genFieldData(AdditionalDataID.TERMINAL_LABEL, this.additionalData.terminal)
    const purpose = QRPay.genFieldData(AdditionalDataID.PURPOSE_OF_TRANSACTION, this.additionalData.purpose)
    const dataRequest = QRPay.genFieldData(AdditionalDataID.ADDITIONAL_CONSUMER_DATA_REQUEST, this.additionalData.dataRequest)

    const additionalDataContent = buildNumber + mobileNumber + storeLabel + loyaltyNumber + reference + customerLabel + terminal + purpose + dataRequest
    const additionalData = QRPay.genFieldData(FieldID.ADDITIONAL_DATA, additionalDataContent)

    const EVMCoContent = Object.keys(this.EVMCo ?? {}).sort().map(key => QRPay.genFieldData(key, this.EVMCo?.[key])).join('')
    const unreservedContent = Object.keys(this.unreserved ?? {}).sort().map(key => QRPay.genFieldData(key, this.unreserved?.[key])).join('')

    const content = `${version}${initMethod}${providerData}${category}${currency}${amountStr}${tipAndFeeType}${tipAndFeeAmount}${tipAndFeePercent}${nation}${merchantName}${city}${zipCode}${additionalData}${EVMCoContent}${unreservedContent}${FieldID.CRC}04`
    const crc = QRPay.genCRCCode(content)
    return content + crc
  }

  public static initVietQR (options: { bankBin: string, bankNumber: string, amount?: string, purpose?: string, service?: VietQRService }): QRPay {
    const qr = new QRPay()
    qr.initMethod = options.amount ? '12' : '11'
    qr.provider.fieldId = FieldID.VIETQR
    qr.provider.guid = QRProviderGUID.VIETQR
    qr.provider.name = QRProvider.VIETQR
    qr.provider.service = options.service || VietQRService.BY_ACCOUNT_NUMBER
    qr.consumer.bankBin = options.bankBin
    qr.consumer.bankNumber = options.bankNumber
    qr.amount = options.amount
    qr.additionalData.purpose = options.purpose
    return qr
  }

  public static initVNPayQR (options: { 
    merchantId: string,
    merchantName: string,
    store: string,
    terminal: string,
    // additional data
    amount?: string,
    purpose?: string,
    billNumber?: string 
    mobileNumber?: string,
    loyaltyNumber?: string,
    reference?: string,
    customerLabel?: string,
  }): QRPay {
    const qr = new QRPay()
    qr.merchant.id = options.merchantId
    qr.merchant.name = options.merchantName
    qr.provider.fieldId = FieldID.VNPAYQR
    qr.provider.guid = QRProviderGUID.VNPAY
    qr.provider.name = QRProvider.VNPAY
    qr.amount = options.amount
    qr.additionalData.purpose = options.purpose
    qr.additionalData.billNumber = options.billNumber
    qr.additionalData.mobileNumber = options.mobileNumber
    qr.additionalData.store = options.store
    qr.additionalData.terminal = options.terminal
    qr.additionalData.loyaltyNumber = options.loyaltyNumber
    qr.additionalData.reference = options.reference
    qr.additionalData.customerLabel = options.customerLabel
    return qr
  }

  public setEVMCoField (id: EVMCoFieldID, value: string): void {
    if (!this.unreserved) this.unreserved = {}
    this.unreserved[id] = value
  }

  public setUnreservedField (id: UnreservedFieldID, value: string): void {
    if (!this.unreserved) this.unreserved = {}
    this.unreserved[id] = value
  }

  private parseRootContent (content: string): void {
    const { id, length, value, nextValue } = QRPay.sliceContent(content)
    if (value.length !== length) return this.invalid()
    switch (id) {
      case FieldID.VERSION:
        this.version = value
        break
      case FieldID.INIT_METHOD:
        this.initMethod = value
        break
      case FieldID.VIETQR:
      case FieldID.VNPAYQR:
        this.provider.fieldId = id
        this.parseProviderInfo(value)
        break
      case FieldID.CATEGORY:
        this.category = value
        break
      case FieldID.CURRENCY:
        this.currency = value
        break
      case FieldID.AMOUNT:
        this.amount = value
        break
      case FieldID.TIP_AND_FEE_TYPE:
        this.tipAndFeeType = value
        break
      case FieldID.TIP_AND_FEE_AMOUNT:
        this.tipAndFeeAmount = value
        break
      case FieldID.TIP_AND_FEE_PERCENT:
        this.tipAndFeePercent = value
        break
      case FieldID.NATION:
        this.nation = value
        break
      case FieldID.MERCHANT_NAME:
        this.merchant.name = value
        break
      case FieldID.CITY:
        this.city = value
        break
      case FieldID.ZIP_CODE:
        this.zipCode = value
        break
      case FieldID.ADDITIONAL_DATA:
        this.parseAdditionalData(value)
        break
      case FieldID.CRC:
        this.crc = value
        break
      default:
        const idNum = Number(id)
        if (idNum >= 65 && idNum <= 79) {
          if (!this.EVMCo) this.EVMCo = {}
          this.EVMCo[id] = value
        } else if (idNum >= 80 && idNum <= 99) {
          if (!this.unreserved) this.unreserved = {}
          this.unreserved[id] = value
        }
        break
    }
    if (nextValue.length > 4) this.parseRootContent(nextValue)
  }

  private parseProviderInfo (content: string): void {
    const { id, value, nextValue } = QRPay.sliceContent(content)
    switch (id) {
      case ProviderFieldID.GUID:
        this.provider.guid = value
        break
      case ProviderFieldID.DATA:
        if (this.provider.guid === QRProviderGUID.VNPAY) {
          this.provider.name = QRProvider.VNPAY
          this.merchant.id = value
        } else if (this.provider.guid === QRProviderGUID.VIETQR) {
          this.provider.name = QRProvider.VIETQR
          this.parseVietQRConsumer(value)
        }
        this.provider.data = value
        break
      case ProviderFieldID.SERVICE:
        this.provider.service = value
        break
      default:
        break
    }
    if (nextValue.length > 4) this.parseProviderInfo(nextValue)
  }

  private parseVietQRConsumer (content: string): void {
    const { id, value, nextValue } = QRPay.sliceContent(content)
    switch (id) {
      case VietQRConsumerFieldID.BANK_BIN:
        this.consumer.bankBin = value
        break
      case VietQRConsumerFieldID.BANK_NUMBER:
        this.consumer.bankNumber = value
        break
      default:
        break
    }
    if (nextValue.length > 4) this.parseVietQRConsumer(nextValue)
  }

  private parseAdditionalData (content: string): void {
    const { id, value, nextValue } = QRPay.sliceContent(content)
    switch (id) {
      case AdditionalDataID.BILL_NUMBER:
        this.additionalData.billNumber = value
        break
      case AdditionalDataID.MOBILE_NUMBER:
        this.additionalData.mobileNumber = value
        break
      case AdditionalDataID.STORE_LABEL:
        this.additionalData.store = value
        break
      case AdditionalDataID.LOYALTY_NUMBER:
        this.additionalData.loyaltyNumber = value
        break
      case AdditionalDataID.REFERENCE_LABEL:
        this.additionalData.reference = value
        break
      case AdditionalDataID.CUSTOMER_LABEL:
        this.additionalData.customerLabel = value
        break
      case AdditionalDataID.TERMINAL_LABEL:
        this.additionalData.terminal = value
        break
      case AdditionalDataID.PURPOSE_OF_TRANSACTION:
        this.additionalData.purpose = value
        break
      case AdditionalDataID.ADDITIONAL_CONSUMER_DATA_REQUEST:
        this.additionalData.dataRequest = value
        break
      default:
        break
    }
    if (nextValue.length > 4) this.parseAdditionalData(nextValue)
  }

  private static verifyCRC (content: string): boolean {
    const checkContent = content.slice(0, -4)
    const crcCode = content.slice(-4).toUpperCase()

    const genCrcCode = QRPay.genCRCCode(checkContent)
    return crcCode === genCrcCode
  }

  public static genCRCCode (content: string): string {
    const crcCode: string = crc16ccitt(content).toString(16).toUpperCase()
    return `0000${crcCode}`.slice(-4)
  }

  private static sliceContent (content: string): { id: string, length: number, value: string, nextValue: string } {
    const id = content.slice(0, 2)
    const length = Number(content.slice(2, 4))
    const value = content.slice(4, 4 + length)
    const nextValue = content.slice(4 + length)
    return { id, length, value, nextValue }
  }

  private invalid (): void {
    this.isValid = false
  }

  private static genFieldData (id?: string, value?: string): string {
    const fieldId = id ?? ''
    const fieldValue = value ?? ''
    const idLen = fieldId.length
    if (idLen !== 2 || fieldValue.length <= 0) return ''
    const length = `00${fieldValue.length}`.slice(-2)
    return `${fieldId}${length}${fieldValue}`
  }
}
