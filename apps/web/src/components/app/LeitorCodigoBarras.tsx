'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/auth/Fields'
import { IconBarcode, IconClose } from '@/components/Icons'
import { tocarBipe } from '@/lib/som'
import styles from './leitor.module.css'

/**
 * Leitor de codigo de barras pela camera.
 *
 * Usa a API nativa `BarcodeDetector`, que hoje existe no Chrome/Edge para
 * Android e desktop, mas NAO no Safari/iOS. Por isso o componente sempre
 * oferece digitacao manual: no aparelho sem suporte, a tela continua
 * util em vez de virar um beco sem saida.
 *
 * Reutilizado pela tela de Vendas para montar o carrinho.
 */

/* A API ainda nao esta no lib.dom padrao do TypeScript. */
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

/** Intervalo entre tentativas de leitura, em ms. */
const INTERVALO_LEITURA = 400

export default function LeitorCodigoBarras({
  onDetectar,
  onClose,
}: {
  onDetectar: (codigo: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [estado, setEstado] = useState<'iniciando' | 'lendo' | 'indisponivel' | 'erro'>('iniciando')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let cancelado = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function iniciar() {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector

      if (!Detector) {
        setEstado('indisponivel')
        setMensagem('Este navegador não lê código de barras pela câmera. Digite o código abaixo.')
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado('indisponivel')
        setMensagem('Câmera indisponível neste navegador. Digite o código abaixo.')
        return
      }

      try {
        /* facingMode "environment" pede a camera traseira no celular. */
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e'],
        })

        setEstado('lendo')

        timer = setInterval(async () => {
          if (!videoRef.current || cancelado) return
          try {
            const encontrados = await detector.detect(videoRef.current)
            if (encontrados.length > 0 && encontrados[0].rawValue) {
              /* Bipe e vibracao curta: a mesma confirmacao de uma leitora de
                 mercado de verdade — sem isso, nada avisa que capturou antes
                 do modal fechar. */
              tocarBipe()
              if (navigator.vibrate) navigator.vibrate(60)
              onDetectar(encontrados[0].rawValue)
              onClose()
            }
          } catch {
            /* Quadro ilegivel: segue tentando no proximo intervalo. */
          }
        }, INTERVALO_LEITURA)
      } catch (e) {
        if (cancelado) return
        setEstado('erro')
        setMensagem(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Permissão de câmera negada. Libere o acesso ou digite o código.'
            : 'Não foi possível abrir a câmera. Digite o código abaixo.',
        )
      }
    }

    void iniciar()

    return () => {
      cancelado = true
      if (timer) clearInterval(timer)
      /* Solta a camera: sem isto o indicador do aparelho fica aceso. */
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetectar, onClose])

  function enviarManual(event: React.FormEvent) {
    event.preventDefault()
    const codigo = manual.trim()
    if (!codigo) return
    onDetectar(codigo)
    onClose()
  }

  return (
    <div className={styles.root}>
      <button type="button" className={styles.backdrop} onClick={onClose} aria-label="Fechar" />

      <div
        className={styles.painel}
        role="dialog"
        aria-modal="true"
        aria-label="Ler código de barras"
      >
        <header className={styles.cabecalho}>
          <h2 className={styles.titulo}>
            <IconBarcode size={19} />
            Ler código de barras
          </h2>
          <button type="button" className={styles.fechar} onClick={onClose} aria-label="Fechar">
            <IconClose size={18} />
          </button>
        </header>

        {estado === 'iniciando' || estado === 'lendo' ? (
          <div className={styles.camera}>
            <video ref={videoRef} className={styles.video} playsInline muted />
            <div className={styles.mira} aria-hidden="true" />
            {estado === 'iniciando' ? (
              <p className={styles.aguardando}>
                <Spinner size={16} />
                Abrindo a câmera...
              </p>
            ) : (
              <p className={styles.instrucao}>Aponte para o código de barras</p>
            )}
          </div>
        ) : null}

        {mensagem ? (
          <p className={styles.aviso} role="status">
            {mensagem}
          </p>
        ) : null}

        {/* Entrada manual: sempre disponivel, nao so no erro */}
        <form onSubmit={enviarManual} className={styles.manual}>
          <label className={styles.manualLabel} htmlFor="codigo-manual">
            Digitar o código
          </label>
          <div className={styles.manualLinha}>
            <input
              id="codigo-manual"
              className={styles.manualInput}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="789..."
              inputMode="numeric"
              autoComplete="off"
            />
            <Button type="submit" disabled={!manual.trim()}>
              Usar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
