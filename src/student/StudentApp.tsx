import { useState } from 'react'
import { daypartFor } from '../menu'
import { signOut, useOrders, useStudent } from '../store'
import { type Cart, cartLines } from './cart'
import SignIn from './SignIn'
import MenuScreen from './MenuScreen'
import Checkout from './Checkout'
import Confirmation from './Confirmation'
import './student.css'

type Step = 'menu' | 'checkout' | 'confirm'

export default function StudentApp() {
  const student = useStudent()
  const orders = useOrders()
  const [step, setStep] = useState<Step>('menu')
  const [cart, setCart] = useState<Cart>({})
  const [orderId, setOrderId] = useState<string | null>(null)

  const go = (s: Step) => {
    setStep(s)
    window.scrollTo(0, 0)
  }

  const activeOrder = student
    ? orders.filter((o) => o.student.usfId === student.usfId && o.status !== 'picked-up').at(-1)
    : undefined
  const shownOrder = orders.find((o) => o.id === orderId) ?? activeOrder

  // Order vanished (e.g. staff reset the demo): really go back to the menu step,
  // so a later order doesn't make the menu jump to a confirmation on its own.
  if (step === 'confirm' && !shownOrder) setStep('menu')

  let screen
  if (!student) screen = <SignIn />
  else if (step === 'checkout')
    screen = (
      <Checkout
        student={student}
        lines={cartLines(cart)}
        onBack={() => go('menu')}
        onPlaced={(id) => {
          setOrderId(id)
          setCart({})
          go('confirm')
        }}
      />
    )
  else if (step === 'confirm' && shownOrder)
    screen = <Confirmation order={shownOrder} onBack={() => go('menu')} />
  else
    screen = (
      <MenuScreen
        daypart={daypartFor()}
        cart={cart}
        setCart={setCart}
        activeOrder={activeOrder}
        onOpenOrder={(id) => {
          setOrderId(id)
          go('confirm')
        }}
        onCheckout={() => go('checkout')}
      />
    )

  return (
    <>
      <header className="header">
        <h1>Market Café</h1>
        {student && (
          <button
            className="link"
            onClick={() => {
              signOut()
              setCart({})
              setOrderId(null)
              go('menu')
            }}
          >
            Sign out
          </button>
        )}
      </header>
      {screen}
    </>
  )
}
