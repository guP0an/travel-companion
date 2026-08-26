import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'

export const AnimatedSheetTitle = Dialog.Title
export const AnimatedSheetClose = Dialog.Close

export default function AnimatedSheet({
  open,
  onOpenChange,
  onExitComplete,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onExitComplete: () => void
  children: ReactNode
}) {
  return (
    <MotionConfig reducedMotion="user">
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <AnimatePresence onExitComplete={onExitComplete}>
          {open && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(4px)' }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(40,38,34,0.45)' }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '100%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 150, damping: 22 }}
                  style={{
                    position: 'fixed',
                    insetInline: 0,
                    bottom: 0,
                    zIndex: 51,
                    width: '100%',
                    maxWidth: '460px',
                    maxHeight: '85dvh',
                    marginInline: 'auto',
                    overflowY: 'auto',
                    borderRadius: '16px 16px 0 0',
                    background: 'var(--color-paper)',
                    padding: '20px 22px 28px',
                    outline: 'none',
                    boxShadow: '0 -18px 48px rgba(40,38,34,0.14)',
                  }}
                >
                  {children}
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </MotionConfig>
  )
}
