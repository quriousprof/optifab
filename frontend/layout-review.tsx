import React from 'react'
import {createRoot} from 'react-dom/client'
import {Canvas} from '@react-three/fiber'
import {OrbitControls,Grid} from '@react-three/drei'
import {MachineMesh,TransitionMesh} from './src/MachineMesh'
import {connectedPorts,linkedAssembly,surfaceTransitions} from './src/connections'
import {WORKSTATION_HEIGHT,type PlacedMachine} from './src/factoryComponents'
import data from './layout-review.json'
import './src/styles.css'
const machines=data.machines as PlacedMachine[]
const transitions=surfaceTransitions(machines)
const stageColor='#c7d6dc'
function Review(){return <div style={{width:'100vw',height:'100vh'}}><Canvas orthographic shadows camera={{position:[70,70,70],zoom:10,near:-10000,far:10000}} gl={{antialias:true,preserveDrawingBuffer:true}}>
<color attach="background" args={['#dfe7ec']}/><ambientLight intensity={1.25}/><directionalLight position={[20,40,15]} intensity={2.2}/>
<mesh position={[0,-.3,0]} receiveShadow><boxGeometry args={[data.floor.width,.6,data.floor.depth]}/><meshStandardMaterial color="#a6adb2" roughness={.92}/></mesh>
<Grid position={[0,.02,0]} args={[data.floor.width,data.floor.depth]} cellSize={1} cellThickness={.45} cellColor="#8d989f" sectionSize={5} sectionThickness={.7} sectionColor="#77838b" fadeDistance={1000}/>
{machines.map(m=><MachineMesh key={m.id} machineId={m.id} componentType={m.componentType} position={[m.position[0],m.workstationId?WORKSTATION_HEIGHT:0,m.position[2]]} length={m.length} breadth={m.breadth} rotation={m.rotation} angle={m.angle} entryAngle={m.entryAngle} exitAngle={m.exitAngle} label={m.label} displayLabel={m.displayLabel} ports={connectedPorts(m,machines)} transitionIn={transitions.some(j=>j.ids[1]===m.id)} transitionOut={transitions.some(j=>j.ids[0]===m.id)} neighbors={machines.filter(p=>p.id!==m.id&&p.componentType==='conveyor-belt'&&p.workstationId===m.workstationId&&linkedAssembly(m.id,machines).has(p.id))}/>)}
{transitions.map(j=><TransitionMesh key={j.ids.join()} {...j} highlighted={false}/>)}
<OrbitControls/>
</Canvas></div>}
createRoot(document.getElementById('root')!).render(<Review/>);
