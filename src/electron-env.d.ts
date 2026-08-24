export {}

declare global {
  interface Window {
    isElectron?: true
    electronTerminal?: {
      spawn: (cols: number, rows: number) => void
      write: (data: string) => void
      resize: (cols: number, rows: number) => void
      onData: (cb: (data: string) => void) => () => void
      onExit: (cb: (code: number) => void) => () => void
    }
  }
}
