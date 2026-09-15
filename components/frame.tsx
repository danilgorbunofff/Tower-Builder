/* Frame -- the static chrome of the page.

   Everything inside #stage that is not generated at runtime: the sky column
   and its weather, the far layer's stars and the moon, the pavement, the roof,
   the sign and the tray. The tower's own storeys, the sky bands, the world
   lanes, the rail and the extra stars are all empty here, because lib/engine.ts
   fills them after mount exactly as the IIFE in index.html does.

   Transcribed from index.html 928-1575 mechanically, so the offset survives:
   line 26 of this file, the opening div, is index.html line 928, and
   every line after it keeps the same step of 902. Four rewrites were
   applied and nothing else -- HTML comments became JSX comments (neither is a
   DOM node), class became className, the one tabindex became a number literal
   because React types it as a number, and the fourteen animation-delay
   attributes on the levitating props became style objects. The fragment is then
   indented by four to sit inside the function; that moves columns, never lines.
   Every id, class, coordinate and piece of copy is otherwise character for
   character.

   baseline/domdiff.mjs exists to hold this file to that claim. It fetches this
   page and index.html, parses both without running any script, and diffs the
   trees node by node, attribute by attribute. */

export function Frame() {
  return (
    <div id="stage">

      <div className="sky">
        <svg className="scene" viewBox="0 0 360 8216" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
          {/* the sky's dithered seams are generated to match the bands buildSky()
               lays down; keeping them here would mean two palettes to keep in step */}
          <defs id="skyDefs"></defs>

          {/* Every art coordinate in here is still the old 360x216 frame's, because
               this group lifts that frame to the bottom of the column: 8216 - 216.
               The frame is the bottom of the sky; the sky is everything above it,
               and y simply keeps going negative. The column is as long as the tallest
               climb the page can ever ask for — the 400-floor cap on the narrowest
               window is 6,990 art units of pan, and 8,000 leaves a few frames of
               slack above the last floor. Anything written at 1x lives in here. */}
          <g transform="translate(0 8000)">

          {/* The sky, one band per phase of the day — built by buildSky(): banded,
               never blended, every seam a dithered 2x2 checker. The column is far
               taller than the frame, running from the hazy daylight over the street
               up into space, so the camera climbs *through* weather instead of
               through a backdrop that gets recoloured behind it. It rides the same
               rail as the ground it meets at the sidewalk. */}
          <g className="slide" id="skyBands"></g>

          {/* What is actually in that sky, at the altitude you meet it: haze over
               the roofs, the sun on the way past, two decks of cloud, the streaks
               the sunset leaves behind, high wisps, the aurora over the top of the
               air. All of it in the old frame's coordinates — the frame is the
               bottom of the column, and the sky is everything above it, so y simply
               keeps going negative. */}
          <g className="slide">

          {/* the air over the street: nothing but haze, and the roofs already lost */}
          <g fill="#ffffff" opacity=".1">
            <rect x="0" y="154" width="360" height="4"/>
            <rect x="0" y="108" width="360" height="8"/>
          </g>
          <g fill="#ffffff" opacity=".07">
            <rect x="0" y="46"  width="360" height="6"/>
            <rect x="0" y="-20" width="360" height="4"/>
          </g>

          {/* the sun, just over the roofs: you start under it, and climbing past it
               is the first thing the tower does. Nudged left of the frame's centre so
               its disc sits on the tower's shoulder instead of beside it. */}
          <g transform="translate(-26 0)">
          <g fill="#fff3c4">
            <rect x="236" y="-46" width="8"  height="3"/>
            <rect x="230" y="-43" width="20" height="3"/>
            <rect x="226" y="-40" width="28" height="3"/>
            <rect x="222" y="-37" width="36" height="3"/>
            <rect x="220" y="-34" width="40" height="3"/>
            <rect x="220" y="-31" width="40" height="3"/>
            <rect x="220" y="-28" width="40" height="3"/>
            <rect x="222" y="-25" width="36" height="3"/>
            <rect x="226" y="-22" width="28" height="3"/>
            <rect x="230" y="-19" width="20" height="3"/>
            <rect x="236" y="-16" width="8"  height="3"/>
          </g>
          <g fill="#fff8dc" opacity=".16">
            <rect x="206" y="-54" width="68" height="6"/>
            <rect x="196" y="-48" width="88" height="52"/>
            <rect x="206" y="4"   width="68" height="6"/>
          </g>
          <g fill="#ffe9a8" opacity=".1">
            <rect x="184" y="-62" width="112" height="72"/>
          </g>
          </g>{/* /sun */}

          {/* the first deck: cumulus, the kind you can still see the city through */}
          <g fill="#eef3fa" opacity=".55">
            <rect x="52"  y="-120" width="30" height="4"/>
            <rect x="42"  y="-116" width="52" height="4"/>
            <rect x="34"  y="-112" width="70" height="6"/>
            <rect x="44"  y="-106" width="52" height="4" fill="#cdd9ea"/>
          </g>
          <g fill="#eef3fa" opacity=".45">
            <rect x="246" y="-186" width="26" height="4"/>
            <rect x="236" y="-182" width="48" height="4"/>
            <rect x="228" y="-178" width="66" height="6"/>
            <rect x="238" y="-172" width="48" height="4" fill="#cdd9ea"/>
          </g>
          <g fill="#f6f9fd" opacity=".5">
            <rect x="96"  y="-252" width="24" height="4"/>
            <rect x="86"  y="-248" width="46" height="4"/>
            <rect x="78"  y="-244" width="64" height="6"/>
            <rect x="88"  y="-238" width="46" height="4" fill="#d5dfee"/>
          </g>

          {/* the second deck: thin, high, and lit from underneath */}
          <g fill="#ffffff" opacity=".32">
            <rect x="0"   y="-350" width="88"  height="3"/>
            <rect x="104" y="-380" width="120" height="3"/>
            <rect x="244" y="-410" width="116" height="3"/>
          </g>
          <g fill="#ffffff" opacity=".22">
            <rect x="14"  y="-446" width="70"  height="2"/>
            <rect x="120" y="-476" width="96"  height="2"/>
            <rect x="252" y="-506" width="94"  height="2"/>
          </g>
          <g fill="#ffffff" opacity=".15">
            <rect x="40"  y="-548" width="56"  height="2"/>
            <rect x="150" y="-578" width="84"  height="2"/>
            <rect x="266" y="-608" width="64"  height="2"/>
          </g>

          {/* golden hour: the whole sky banded sideways, warm under cool */}
          <g fill="#ffe3b0" opacity=".4">
            <rect x="0" y="-334" width="360" height="3"/>
            <rect x="0" y="-362" width="360" height="2"/>
          </g>
          <g fill="#ffd9a0" opacity=".32">
            <rect x="0" y="-392" width="360" height="3"/>
            <rect x="0" y="-424" width="360" height="2"/>
          </g>
          <g fill="#ffc27a" opacity=".26">
            <rect x="0" y="-458" width="360" height="3"/>
            <rect x="0" y="-494" width="360" height="2"/>
          </g>

          {/* the sun going down behind the weather: the one warm thing left */}
          <g fill="#ffb066" opacity=".3">
            <rect x="0"   y="-548" width="360" height="4"/>
            <rect x="262" y="-572" width="98"  height="3"/>
            <rect x="0"   y="-580" width="198" height="3"/>
            <rect x="0"   y="-604" width="268" height="3"/>
          </g>
          <g fill="#ffa271" opacity=".24">
            <rect x="0" y="-636" width="360" height="3"/>
            <rect x="0" y="-672" width="300" height="2"/>
            <rect x="0" y="-710" width="336" height="3"/>
          </g>
          <g fill="#ef7f5c" opacity=".2">
            <rect x="0" y="-742" width="228" height="3"/>
            <rect x="0" y="-768" width="290" height="2"/>
          </g>

          {/* dusk: the last of the light, and no weather left to catch it */}
          <g fill="#5b4c7e" opacity=".38">
            <rect x="0" y="-800" width="360" height="3"/>
            <rect x="0" y="-842" width="224" height="2"/>
            <rect x="0" y="-886" width="360" height="3"/>
          </g>
          <g fill="#443a70" opacity=".32">
            <rect x="0" y="-932" width="316" height="2"/>
            <rect x="0" y="-980" width="360" height="3"/>
            <rect x="0" y="-1024" width="164" height="2"/>
          </g>

          {/* night over the weather: nothing left up here to catch the colour */}
          <g fill="#2c3a6a" opacity=".28">
            <rect x="0" y="-1062" width="360" height="2"/>
            <rect x="0" y="-1122" width="276" height="2"/>
          </g>
          <g fill="#243056" opacity=".24">
            <rect x="0" y="-1186" width="336" height="3"/>
            <rect x="0" y="-1246" width="212" height="2"/>
          </g>

          {/* over the top of the weather: polar light, very faint, very wide */}
          <g fill="#5ce8c0" opacity=".17">
            <rect x="52"  y="-1322" width="46" height="62"/>
            <rect x="68"  y="-1340" width="34" height="20"/>
          </g>
          <g fill="#5cbdf0" opacity=".14">
            <rect x="120" y="-1372" width="58" height="56"/>
            <rect x="136" y="-1388" width="30" height="18"/>
          </g>
          <g fill="#7de0b8" opacity=".13">
            <rect x="196" y="-1424" width="42" height="60"/>
            <rect x="212" y="-1442" width="28" height="20"/>
          </g>
          <g fill="#3f7fd8" opacity=".12">
            <rect x="262" y="-1470" width="52" height="52"/>
            <rect x="278" y="-1484" width="28" height="16"/>
          </g>

          </g>{/* /slide */}

          {/* clouds, cool underneath in daylight. You climb through these, so they
               belong to the falling world too; their own wind keeps blowing. */}
          <g className="slide"><g className="clouds">
            <g fill="#e2eaf5" opacity=".85">
              <rect x="30" y="112" width="24" height="2"/>
              <rect x="22" y="114" width="46" height="2"/>
              <rect x="16" y="116" width="60" height="2"/>
              <rect x="24" y="118" width="44" height="2" fill="#adbbd2"/>
            </g>
            <g fill="#e2eaf5" opacity=".85">
              <rect x="228" y="100" width="22" height="2"/>
              <rect x="220" y="102" width="44" height="2"/>
              <rect x="212" y="104" width="62" height="2"/>
              <rect x="222" y="106" width="44" height="2" fill="#adbbd2"/>
            </g>
            <g fill="#e9f0f9" opacity=".9">
              <rect x="252" y="140" width="26" height="2"/>
              <rect x="242" y="142" width="52" height="2"/>
              <rect x="232" y="144" width="76" height="2"/>
              <rect x="244" y="146" width="54" height="2" fill="#b6c4d8"/>
            </g>
            <g fill="#e9f0f9" opacity=".9">
              <rect x="44" y="150" width="22" height="2"/>
              <rect x="34" y="152" width="46" height="2"/>
              <rect x="24" y="154" width="70" height="2"/>
              <rect x="36" y="156" width="48" height="2" fill="#b6c4d8"/>
            </g>
            <g fill="#f1f6fc" opacity=".9">
              <rect x="292" y="166" width="30" height="2"/>
              <rect x="282" y="168" width="54" height="2"/>
              <rect x="274" y="170" width="70" height="2"/>
            </g>
            {/* birds, heading home */}
            <g fill="#2a2b45" opacity=".7">
              <rect x="120" y="96"  width="2" height="1"/>
              <rect x="122" y="97"  width="2" height="1"/>
              <rect x="124" y="96"  width="2" height="1"/>
              <rect x="142" y="104" width="1" height="1"/>
              <rect x="143" y="105" width="2" height="1"/>
              <rect x="145" y="104" width="1" height="1"/>
            </g>
          </g></g>{/* /slide */}

          {/* everything at street level — skyline, distant windows, sidewalk, street
               markings — rides down with the camera and leaves the frame from below */}
          <g className="slide">
          {/* distant skyline, two rows deep */}
          <g fill="#2b3350">
            <rect x="0"   y="176" width="34" height="16"/>
            <rect x="30"  y="168" width="22" height="24"/>
            <rect x="48"  y="180" width="30" height="12"/>
            <rect x="74"  y="170" width="18" height="22"/>
            <rect x="88"  y="178" width="26" height="14"/>
            <rect x="110" y="166" width="20" height="26"/>
            <rect x="252" y="172" width="24" height="20"/>
            <rect x="272" y="178" width="30" height="14"/>
            <rect x="298" y="168" width="20" height="24"/>
            <rect x="314" y="176" width="46" height="16"/>
          </g>
          <g fill="#3d4767">
            <rect x="4"   y="184" width="18" height="8"/>
            <rect x="52"  y="186" width="14" height="6"/>
            <rect x="92"  y="184" width="16" height="8"/>
            <rect x="256" y="184" width="18" height="8"/>
            <rect x="302" y="184" width="14" height="8"/>
            <rect x="330" y="186" width="22" height="6"/>
          </g>
          {/* a few windows already on, out in the distance */}
          <g fill="#ffcd63">
            <rect x="35"  y="173" width="3" height="3"/>
            <rect x="80"  y="176" width="3" height="3"/>
            <rect x="116" y="172" width="3" height="3"/>
            <rect x="259" y="178" width="3" height="3"/>
            <rect x="304" y="174" width="3" height="3"/>
          </g>

          {/* the sidewalk the tower stands on */}
          <rect y="190" width="360" height="2" fill="#7b8095"/>
          <rect y="192" width="360" height="24" fill="#4c5060"/>
          <rect y="196" width="360" height="2" fill="#3a3e4d"/>
          <g fill="#3a3e4d">
            <rect x="28"  y="202" width="2" height="14"/><rect x="72"  y="202" width="2" height="14"/>
            <rect x="116" y="202" width="2" height="14"/><rect x="160" y="202" width="2" height="14"/>
            <rect x="204" y="202" width="2" height="14"/><rect x="248" y="202" width="2" height="14"/>
            <rect x="292" y="202" width="2" height="14"/><rect x="336" y="202" width="2" height="14"/>
          </g>
          <g fill="#5b6076">
            <rect x="20"  y="204" width="6" height="2"/><rect x="96"  y="208" width="5" height="2"/>
            <rect x="176" y="205" width="6" height="2"/><rect x="312" y="209" width="5" height="2"/>
          </g>
          </g>{/* /slide */}

          {/* the things that float: the ordinary at the bottom and the strange
               above it, until the street's own lamppost is burning in deep space.
               These are only the drawn shapes, in escalation order; placeProps()
               rungs them from just above the parked frame to whatever ceiling this
               layout can climb to, cycling the fourteen when the climb is taller
               than the ladder, and sets each translate — because the building is a
               share of the window rather than a fixed width and the sky is cropped
               to that share, so where a prop may sit is measured off its own
               painted cells, never guessed. The motion lives on the inner <g>:
               a CSS transform replaces a transform attribute outright. */}
          <g className="slide" id="levProps">
            <g className="prop"><g className="lev-bob" style={{animationDelay:"-2s"}}>
              <g fill="#b98a52">
                <rect x="-6" y="-13" width="2" height="26"/>
                <rect x="4" y="-13" width="2" height="26"/>
              </g>
              <g fill="#8a6238">
                <rect x="-4" y="-9" width="8" height="2"/>
                <rect x="-4" y="-4" width="8" height="2"/>
                <rect x="-4" y="1" width="8" height="2"/>
                <rect x="-4" y="6" width="8" height="2"/>
              </g>
            </g></g>
            <g className="prop"><g className="lev-sway" style={{animationDelay:"-5s"}}>
              <g fill="#e05b52">
                <rect x="-4" y="-12" width="8" height="4"/>
                <rect x="-5" y="-10" width="10" height="6"/>
                <rect x="-3" y="-6" width="6" height="4"/>
                <rect x="-1" y="-2" width="2" height="2"/>
              </g>
              <rect x="-3" y="-11" width="2" height="4" fill="#f3928a"/>
              <rect x="0" y="0" width="1" height="9" fill="#9aa3b8" opacity=".7"/>
            </g></g>
            <g className="prop"><g className="lev-sway" style={{animationDelay:"-9s"}}>
              <g fill="#e8eef7">
                <rect x="-8" y="-1" width="16" height="2"/>
                <rect x="-3" y="-3" width="11" height="2"/>
                <rect x="2" y="-5" width="6" height="2"/>
              </g>
              <g fill="#b9c4d6">
                <rect x="-8" y="1" width="16" height="2"/>
                <rect x="-3" y="3" width="11" height="2"/>
                <rect x="2" y="5" width="6" height="2"/>
              </g>
            </g></g>
            <g className="prop"><g className="lev-bob" style={{animationDelay:"-11s"}}>
              <rect x="-6" y="-4" width="12" height="10" fill="#f1f6fc"/>
              <rect x="-6" y="4" width="12" height="2" fill="#c9d3e2"/>
              <rect x="-6" y="-4" width="12" height="2" fill="#cfd8e6"/>
              <rect x="-4" y="-2" width="8" height="2" fill="#6b4a32"/>
              <rect x="4" y="-2" width="2" height="5" fill="#eef3fa"/>
              <rect x="6" y="-3" width="2" height="7" fill="#d8dfe9"/>
              <g fill="#cfd8e6" opacity=".75">
                <rect x="-2" y="-9" width="2" height="3"/>
                <rect x="0" y="-13" width="2" height="3"/>
                <rect x="2" y="-8" width="2" height="2"/>
              </g>
            </g></g>
            <g className="prop"><g className="lev-sway" style={{animationDelay:"-3s"}}>
              <rect x="-6" y="0" width="12" height="6" fill="#f2c341"/>
              <rect x="-6" y="4" width="12" height="2" fill="#d9a92f"/>
              <rect x="-6" y="0" width="3" height="4" fill="#e8b93a"/>
              <rect x="-4" y="-6" width="7" height="6" fill="#f2c341"/>
              <rect x="-2" y="-7" width="4" height="1" fill="#f7dc8a"/>
              <rect x="3" y="-4" width="4" height="2" fill="#e07f2a"/>
              <rect x="-1" y="-4" width="1" height="1" fill="#2a2b45"/>
            </g></g>
            <g className="prop"><g className="lev-flip" style={{animationDelay:"-6s"}}>
              <g fill="#e07f2a">
                <rect x="-8" y="-6" width="16" height="2"/>
                <rect x="-6" y="-4" width="12" height="2"/>
                <rect x="-4" y="-2" width="8" height="2"/>
                <rect x="-2" y="0" width="4" height="6"/>
              </g>
              <rect x="-8" y="-6" width="16" height="1" fill="#f0a860"/>
              <rect x="-5" y="-3" width="10" height="2" fill="#f1f6fc"/>
            </g></g>
            <g className="prop"><g className="lev-sway" style={{animationDelay:"-13s"}}>
              <g fill="#bfe6f0" opacity=".4">
                <rect x="-7" y="-6" width="14" height="12"/>
                <rect x="-5" y="-8" width="10" height="2"/>
                <rect x="-3" y="-10" width="6" height="2"/>
              </g>
              <rect x="-6" y="-3" width="12" height="9" fill="#8fd2e6" opacity=".5"/>
              <rect x="-6" y="6" width="12" height="2" fill="#a8dcea" opacity=".6"/>
              <g fill="#f08a3c">
                <rect x="-4" y="0" width="8" height="4"/>
                <rect x="0" y="-2" width="4" height="2"/>
              </g>
              <rect x="-7" y="1" width="3" height="2" fill="#e07f2a"/>
              <rect x="2" y="0" width="1" height="1" fill="#2a2b45"/>
              <rect x="-2" y="-12" width="4" height="2" fill="#c9d3e2"/>
            </g></g>
            <g className="prop"><g className="lev-bob" style={{animationDelay:"-7s"}}>
              <g fill="#c9a06a">
                <rect x="-8" y="-10" width="2" height="18"/>
                <rect x="-8" y="6" width="18" height="2"/>
                <rect x="8" y="2" width="2" height="6"/>
                <rect x="4" y="-12" width="2" height="16"/>
              </g>
              <g fill="#e05b52">
                <rect x="-6" y="-9" width="9" height="2"/>
                <rect x="-6" y="-5" width="9" height="2"/>
                <rect x="-6" y="-1" width="9" height="2"/>
              </g>
              <rect x="-6" y="3" width="16" height="2" fill="#f1f6fc"/>
              <rect x="-6" y="5" width="16" height="1" fill="#cfd8e6"/>
            </g></g>
            <g className="prop"><g className="lev-flip" style={{animationDelay:"-15s"}}>
              <rect x="-8" y="-4" width="16" height="8" fill="#b8503c"/>
              <rect x="-8" y="-4" width="16" height="2" fill="#d8a08c"/>
              <rect x="-8" y="2" width="16" height="2" fill="#8f3b2c"/>
              <rect x="-4" y="-1" width="4" height="3" fill="#7a2f24"/>
              <rect x="2" y="0" width="2" height="2" fill="#7a2f24"/>
            </g></g>
            <g className="prop"><g className="lev-flip" style={{animationDelay:"-4s"}}>
              <g fill="#8f97ab">
                <rect x="-8" y="-7" width="16" height="1"/>
                <rect x="-8" y="-1" width="16" height="1"/>
                <rect x="-8" y="-7" width="1" height="7"/>
                <rect x="7" y="-7" width="1" height="7"/>
                <rect x="-10" y="-9" width="11" height="1"/>
                <rect x="-10" y="-9" width="1" height="3"/>
              </g>
              <rect x="-8" y="1" width="18" height="2" fill="#5b6076"/>
              <rect x="-2" y="3" width="14" height="2" fill="#5b6076"/>
              <rect x="-7" y="5" width="3" height="4" fill="#2a2b45"/>
              <rect x="5" y="5" width="3" height="4" fill="#2a2b45"/>
            </g></g>
            <g className="prop"><g className="lev-sway" style={{animationDelay:"-8s"}}>
              <g fill="#5fa85f">
                <rect x="-1" y="-12" width="3" height="9"/>
                <rect x="-7" y="-9" width="6" height="6"/>
                <rect x="2" y="-10" width="5" height="7"/>
                <rect x="-4" y="-14" width="5" height="5"/>
              </g>
              <rect x="-7" y="-4" width="14" height="2" fill="#3f7a45"/>
              <rect x="-6" y="-2" width="12" height="3" fill="#b8703c"/>
              <rect x="-6" y="-2" width="12" height="1" fill="#d8965a"/>
              <rect x="-4" y="1" width="8" height="7" fill="#a05f30"/>
            </g></g>
            <g className="prop"><g className="lev-bob" style={{animationDelay:"-14s"}}>
              <rect x="-10" y="-16" width="20" height="32" fill="#ffcd63" opacity=".14"/>
              <rect x="-8" y="-15" width="16" height="30" fill="#b98a52"/>
              <rect x="-8" y="-15" width="16" height="2" fill="#d8a86a"/>
              <rect x="-6" y="-12" width="12" height="10" fill="#ffcd63"/>
              <rect x="-6" y="2" width="12" height="10" fill="#ffcd63"/>
              <rect x="-6" y="-12" width="12" height="2" fill="#e8a33d"/>
              <rect x="-6" y="2" width="12" height="2" fill="#e8a33d"/>
              <rect x="3" y="-1" width="2" height="3" fill="#8a6238"/>
              <rect x="-8" y="13" width="16" height="2" fill="#8a6238"/>
            </g></g>
            <g className="prop"><g className="lev-bob" style={{animationDelay:"-1s"}}>
              <g fill="#5b7fbf">
                <rect x="-13" y="-9" width="17" height="7"/>
                <rect x="-13" y="-2" width="17" height="10"/>
                <rect x="-15" y="-6" width="4" height="14"/>
                <rect x="2" y="-6" width="4" height="14"/>
              </g>
              <rect x="-11" y="-3" width="13" height="2" fill="#7f9fd4"/>
              <rect x="-11" y="4" width="13" height="2" fill="#f1f6fc"/>
              <rect x="-15" y="6" width="23" height="3" fill="#4a5a6e"/>
              <rect x="-10" y="9" width="3" height="4" fill="#4a5a6e"/>
              <rect x="6" y="9" width="3" height="4" fill="#4a5a6e"/>
              <rect x="9" y="-8" width="2" height="19" fill="#8f97ab"/>
              <rect x="6" y="-14" width="8" height="4" fill="#ffcd63"/>
              <rect x="6" y="-16" width="8" height="2" fill="#8f97ab"/>
            </g></g>
            {/* the lamp from the pavement, still on: the street art itself, up here
                 where nothing it used to stand on came with it */}
            <g className="prop"><g className="lev-bob" style={{animationDelay:"-10s"}}>
              <g fill="#7d7a80" opacity=".95">
                <rect x="-12" y="10" width="26" height="2"/>
                <rect x="-10" y="9" width="22" height="1" fill="#6e6a70"/>
                <rect x="-10" y="8" width="20" height="1" fill="#5b5c6b"/>
              </g>
              <g fill="#3d4767">
                <rect x="4" y="8" width="8" height="2"/>
                <rect x="6" y="-8" width="4" height="16"/>
                <rect x="4" y="-10" width="8" height="2"/>
              </g>
              <g fill="#ffe7a6">
                <rect x="4" y="-8" width="8" height="5"/>
                <rect x="6" y="-2" width="4" height="2"/>
              </g>
              <rect x="6" y="-6" width="4" height="2" fill="#ffc22e"/>
            </g></g>
          </g>{/* /levProps */}
          </g>{/* /frame */}
        </svg>

        {/* The far layer: the stars, the moon and the worlds, the only things up here
             that are not standing on the ground. Its own SVG because the scene is written
             in the whole sky column while this layer is written in the frame: it belongs
             to the window, not to the world, so it is faded in by altitude and carried
             along by the climb instead of being scrolled into view.
             The window is 216 units tall — the frame's own box, kept as it is so that this
             layer and the scene always read at the same scale — and everything the climb
             still has to reach is written *above* it, at negative y. What brings it down
             is the crawl, not the camera: at a twentieth of the climb the whole layer
             moves 350 units over the four-hundred-floor run, so this is written about
             seven times deeper than any one page walks, and its last row is still
             arriving long after the last floor is built.
             One rail, one speed, one subject: the stars, the moon and the worlds all
             creep together, and what separates them is nothing but where they stand —
             the moon where it should be on the night the tower first reaches it, the
             worlds hung half a frame apart above it. Out here distance is a speed
             before it is a size, and all of it is passed, none of it is reached. */}
        <svg className="far" viewBox="0 0 360 216" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
          <g className="drift">
            <g className="stars" id="starField">
              <g fill="#ffffff">
                <rect x="12"  y="8"  width="2" height="2"/><rect x="86"  y="6"  width="2" height="2"/>
                <rect x="158" y="12" width="2" height="2"/><rect x="268" y="8"  width="2" height="2"/>
                <rect x="344" y="18" width="2" height="2"/><rect x="70"  y="20" width="2" height="2"/>
                <rect x="232" y="22" width="2" height="2"/><rect x="120" y="16" width="1" height="1"/>
              </g>
              <g fill="#ffffff" opacity=".8">
                <rect x="24"  y="30" width="2" height="2"/><rect x="104" y="34" width="2" height="2"/>
                <rect x="180" y="32" width="1" height="1"/><rect x="290" y="36" width="2" height="2"/>
                <rect x="48"  y="40" width="1" height="1"/><rect x="142" y="44" width="2" height="2"/>
                <rect x="252" y="28" width="2" height="2"/><rect x="326" y="42" width="1" height="1"/>
              </g>
              <g fill="#ffffff" opacity=".72">
                <rect x="8"   y="56" width="2" height="2"/><rect x="92"  y="60" width="2" height="2"/>
                <rect x="168" y="58" width="1" height="1"/><rect x="282" y="62" width="2" height="2"/>
                <rect x="38"  y="70" width="1" height="1"/><rect x="130" y="68" width="2" height="2"/>
                <rect x="244" y="66" width="1" height="1"/><rect x="350" y="58" width="1" height="1"/>
              </g>
              <g fill="#ffffff" opacity=".55">
                <rect x="56"  y="82" width="1" height="1"/><rect x="116" y="90" width="2" height="2"/>
                <rect x="196" y="86" width="1" height="1"/><rect x="300" y="94" width="1" height="1"/>
                <rect x="24"  y="96" width="1" height="1"/><rect x="256" y="98" width="1" height="1"/>
              </g>
            </g>{/* /stars */}
      
            {/* The worlds, standing at the moon's distance rather than on a rail of
                 their own: this group is a child of .drift, so it creeps at the moon's
                 rate, and the only thing that can bring a world through the frame is
                 the height it was given — half a frame apart, from the moon's own rows
                 up to the top of the star field. buildWorlds() draws them from the
                 table; placeWorlds() re-lanes them on every resize; there are as many
                 rungs as the layer is deep, so the ladder never runs out. It stands
                 before the moon in the document for the same reason it is dimmer than
                 the moon: a lane can land on the moon's own rows, and the one thing
                 that must never happen is a world drawn through her disc. */}
            <g className="planets" id="worldField"></g>

            {/* full moon, drawn as cross-section rows. It keeps its height and waits
                 for the sky to darken enough to show it: it is over the horizon the
                 whole afternoon, and nobody can see it until the sun is low. */}
            <g className="moon" transform="translate(-88 0)">
              <g fill="#f6f2d8">
                <rect x="314" y="30" width="8"  height="2"/>
                <rect x="310" y="32" width="16" height="2"/>
                <rect x="308" y="34" width="20" height="2"/>
                <rect x="306" y="36" width="24" height="2"/>
                <rect x="304" y="38" width="28" height="2"/>
                <rect x="302" y="40" width="32" height="2"/>
                <rect x="302" y="42" width="32" height="2"/>
                <rect x="302" y="44" width="32" height="2"/>
                <rect x="302" y="46" width="32" height="2"/>
                <rect x="302" y="48" width="32" height="2"/>
                <rect x="302" y="50" width="32" height="2"/>
                <rect x="302" y="52" width="32" height="2"/>
                <rect x="304" y="54" width="28" height="2"/>
                <rect x="306" y="56" width="24" height="2"/>
                <rect x="308" y="58" width="20" height="2"/>
                <rect x="310" y="60" width="16" height="2"/>
                <rect x="314" y="62" width="8"  height="2"/>
              </g>
              <g fill="#e3ddb8">
                <rect x="307" y="40" width="5" height="4"/>
                <rect x="316" y="48" width="6" height="4"/>
                <rect x="311" y="55" width="4" height="3"/>
                <rect x="322" y="42" width="4" height="3"/>
              </g>
            </g>{/* /moon */}
          </g>{/* /drift */}
        </svg>

        {/* the pavement: lamp, a building-width gap, then the neighbours */}
        <div className="pavement" aria-hidden="true">
          <div className="slot side left">
            <svg className="lamppost" viewBox="0 0 24 24" focusable="false">
              <g fill="#7d7a80" opacity=".95">
                <rect x="0" y="22" width="24" height="2"/>
                <rect x="1" y="21" width="22" height="1" fill="#6e6a70"/>
                <rect x="2" y="20" width="20" height="1" fill="#5b5c6b"/>
              </g>
              <g fill="#3d4767">
                <rect x="17" y="20" width="7" height="2"/>
                <rect x="19" y="4"  width="3" height="16"/>
                <rect x="17" y="2"  width="7" height="2"/>
              </g>
              <g fill="#ffe7a6">
                <rect x="17" y="4" width="7" height="5"/>
                <rect x="19" y="9" width="3" height="2"/>
              </g>
              <rect x="19" y="6" width="3" height="2" fill="#ffc22e"/>
            </svg>
          </div>

          <div className="slot mid"></div>

          <div className="slot side right">
            <svg className="passersby" viewBox="0 0 18 20" focusable="false">
              <g fill="#1b2138">
                <rect x="2"  y="4"  width="3" height="3"/>
                <rect x="1"  y="7"  width="5" height="6"/>
                <rect x="2"  y="13" width="1" height="5"/>
                <rect x="4"  y="13" width="1" height="5"/>
                <rect x="9"  y="5"  width="3" height="3"/>
                <rect x="8"  y="8"  width="5" height="6"/>
                <rect x="9"  y="14" width="1" height="4"/>
                <rect x="11" y="14" width="1" height="4"/>
                <rect x="13" y="11" width="4" height="3"/>
                <rect x="15" y="9"  width="3" height="3"/>
                <rect x="13" y="14" width="1" height="3"/>
                <rect x="16" y="14" width="1" height="3"/>
              </g>
            </svg>
          </div>
        </div>

        <div className="camera">
          <div className="tower" id="tower">
            <ol className="stack" id="stack" aria-hidden="true"></ol>
            <div className="roof" id="roof">
              <div className="mast"></div>
              <div className="beacon"></div>
              <div className="tank"></div>
              <div className="hatch"></div>
              <div className="parapet"></div>
            </div>
          </div>
        </div>

        {/* The climb. Nothing here is drawn: the scroller exists so a wheel, a
             trackpad, a scrollbar gesture or an arrow key can drive the camera up
             the rail. Its only child is the rail itself, which is exactly as tall
             as the tower is, so the distance you can scroll *is* the height you
             have built. Transparent and on top of the art, because it has to feel
             the hand that is on it. */}
        <div className="scroller" id="scroller" tabIndex={0} role="region" aria-label="Climb the tower"><div className="scroll-rail" id="rail"></div></div>

        <button className="totop" id="totop" type="button" aria-label="Back to the top of the tower">
          <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
            <g fill="currentColor">
              <rect x="5" y="1" width="2" height="2"/>
              <rect x="4" y="3" width="4" height="2"/>
              <rect x="3" y="5" width="6" height="2"/>
              <rect x="2" y="7" width="8" height="2"/>
              <rect x="1" y="9" width="10" height="2"/>
            </g>
          </svg>
        </button>
      </div>

      <div className="sign">
        <p className="sign-k">FLOORS BUILT</p>
        <p className="sign-n" id="signN">0</p>
        <div className="sign-row"><span>TAKEN</span><b id="signCash">$0</b></div>
        <span className="sign-last">LAST IN — <b id="signLast">—</b></span>
      </div>

      <div className="tray">
        <button className="order" id="order" type="button" aria-label="Build one floor for one dollar">
          <span className="order-label"><em id="orderPrice">$1</em> <span id="orderText">BUILD A FLOOR</span></span>
          <span className="order-meter"><i id="orderBar"></i></span>
        </button>
        <p className="order-hint" id="note">PAYMENTS ARE OFF — NOTHING IS CHARGED. <b>HOLD TO BUILD MORE — ONE CHARGE.</b></p>
      </div>

      <p className="sr" id="live" aria-live="polite"></p>
    </div>
  );
}
