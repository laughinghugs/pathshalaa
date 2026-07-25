// Draws the 4 registration-mark corners for a `.blueprint`-framed element.
// A `.blueprint` container must be position:relative for these to place
// correctly (see .blueprint > .corner in App.css).
export default function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  )
}
