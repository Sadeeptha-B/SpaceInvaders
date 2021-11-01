/**
 * Space Invaders Game written for Assignnment 1 for FIT2102 S2 2021
 * 
 * Author: Sadeeptha Bandara
 * StudentId: 30769140
 * 
 * 
 * The implementation provided is a full game implementation with robust features, the game can keep track of score, * levels, is restartable, and has shields to obstruct alien bullets. The speed of the aliens increase as the number of 
 * aliens decrease. Different alien types are available, and are associated with different scores
 * 
 * 
 * Code is inspired by the asteroids example in the course notes.
 * The functions not, except and setAttributes are taken from the notes and the use of radius to recognize collisions is 
 * inspired from it as well.
 */

import { from, fromEvent, interval, zip } from 'rxjs'
import {merge, filter, map, scan, take, flatMap} from 'rxjs/operators'


//Run the game
if (typeof window != 'undefined')
  window.onload = ()=>{
    spaceinvaders();
}

function spaceinvaders(){
  /**
  Constants and type aliases 
  ----------------------------------
   */

  //General program constants
  const Constants = {
    CanvasSize: 600,
    GameFrameRate: 10,
    StartTime: 0,
    KeyPressSpeed: 2,
    BulletSpeed: 5,
    BulletLength: 15,
    AliensPerRow: 11,
    AlienRows: 5,
    AlienBulletLimit: 3,
    AlienRowStartX: 95,
    AlienRowStartY: 100,
    AlienXGap: 40,
    AlienYGap: 60,
    ShieldStartX: 70,
    ShieldXGap: 150,
    ShieldXOffset: 24,
    ShieldYOffset: 16.5,
    ShieldStartY: 492,
    get KeyRight() {return this.KeyPressSpeed},
    get KeyLeft(){return -this.KeyPressSpeed}
  } as const


  const ConstantVectors = {
    ShipInitPos: new Vec(300,565),
    ShipInitVelocity: new Vec(0,0),
    AlienXVelocity: new Vec(0.21, 0),
    AlienYVelocity: new Vec(0, 3),
    get ShipBlasterLocation() {return this.ShipInitPos.y - 6},
  } as const


  //The alien types present in each row
  const AlienTypes: {[row:number]: string} = {
    0: "alienType1",
    1: "alienType2",
    2: "alienType2",
    3: "alienType3",
    4: "alienType3"
  } as const


  //Score table: Scores for each relevant type
  const AlienScores: {[row:string]: number}= {
    alienType1: 30,
    alienType2: 20,
    alienType3: 20,
  } as const


  //Scaling for speed 
  const AlienSpeedup: {[count:string]: number}={
    high: 5,
    moderate: 1.25,
    fine: 1.1,
    low: 1
  } as const


  //Radius for bodies including the alien types and ships
  const BodyRadii: {[key:string]: [number, number]} ={
   ship: [25,6],
   alienType1: [5,15],
   alienType2: [20,20],
   alienType3: [15,10],
   shield: [33,20],
   damage: [3,3]
  } 

  const ShapeCorrectionVectors: {[key:string]: Vec} = {
    alienType1: new Vec(16,15).scale(-1),
    alienType2: new Vec(13, 14).scale(-1),
    alienType3: new Vec(20, 18).scale(-1),
  } as const

  const BodyIDs :{[key:string]: string} = {
    ship: "ship", 
    alien: "alien",
    bullet: "bullet",
    alienbullet: "alienbullet",
    shield:"shield",
    damage: "damage"
  }

  //Commonly used constant and element
  const CanvasSize = Constants.CanvasSize,
        canvas = document.getElementById("canvas")

  //General state object for a body: Ship, Bullet, Alien
  type Body = {
    id: string,
    pos: Vec,
    vel: Vec,
    createTime: number,
    radiusX: number, 
    radiusY:number,
    row: number
    damage: ReadonlyArray<Body>
  }

  //Game state
  type State = {
    time: number,
    ship: Body,
    bullets: ReadonlyArray<Body>,
    aliens:ReadonlyArray<Body>,
    shields:ReadonlyArray<Body>
    exit: ReadonlyArray<Body>,
    objCount: number
    gameOver: boolean,
    score: number,
    levelWon: boolean,
    level: number
    restart: boolean,
  }


  /** Constructors 
   * -----------------------------
  */

  //Generic function to create a body
  const create = (viewType: string) => (vel:Vec) => ([radiusX, radiusY] = [0,0]) => (oid: string, time:number) =>  (pos:Vec, row?:number):Body => <Body>{
    id: `${viewType}${oid}`,
    pos: pos,
    vel: vel,
    createTime:time,
    radiusX: radiusX,
    radiusY:radiusY,
    row: row,
    damage: []
  }

  const createAlien = create(BodyIDs.alien)(ConstantVectors.AlienXVelocity),
        createBullet = create(BodyIDs.bullet)(new Vec(0, Constants.BulletSpeed))(),
        createAlienBullet = create(BodyIDs.alienbullet)(new Vec(0, Constants.BulletSpeed).scale(-1))(),
        createShield = create(BodyIDs.shield)(Vec.Zero)(BodyRadii.shield),
        createDamage = create(BodyIDs.damage)(Vec.Zero)(BodyRadii.damage)


  //Identifier methods
  const is = (idString: string) =>(body: Body) => body.id.includes(idString)

  const isAlien = is(BodyIDs.alien),
        isBullet = is(BodyIDs.bullet), 
        isAlienBullet = is(BodyIDs.alienbullet),
        isShield = is(BodyIDs.shield)

  /**
   * Initialisation
   * -----------------------------
   *  */ 
  const initShip = create('ship')(ConstantVectors.ShipInitVelocity)(BodyRadii.ship)('', Constants.StartTime)(ConstantVectors.ShipInitPos)

  const initAliens = [...Array(Constants.AlienRows).keys()].map(row => 
                    [...Array(Constants.AliensPerRow).keys()].map(a =>
                      createAlien(BodyRadii[AlienTypes[row]])(`${row}-${a}`, 0)
                      (new Vec(Constants.AlienRowStartX + Constants.AlienXGap*a, Constants.AlienRowStartY + Constants.AlienYGap* row), row))
                  ).flat()

  const shieldBaseLocation = (curr: number) => new Vec(Constants.ShieldStartX + Constants.ShieldXGap*curr, Constants.ShieldStartY),
  
  initShields =[...Array(4).keys()].map(elem => 
      [createShield(`${elem}`, 0)(shieldBaseLocation(elem)), 
      createShield(`${elem}-1`, 0)(shieldBaseLocation(elem).add(new Vec(-Constants.ShieldXOffset, Constants.ShieldYOffset))),
      createShield(`${elem}-2`, 0)(shieldBaseLocation(elem).add(new Vec(Constants.ShieldXOffset, Constants.ShieldYOffset)))]
  ).flat()

  const initialState: State = {
    time: 0, 
    ship: initShip,
    bullets: [],
    aliens:initAliens,
    shields: initShields, 
    exit: [],
    objCount:0,
    gameOver: false,
    score: 0,
    levelWon: false,
    level: 1,
    restart: false
  }  

  /**
   * Event payloads to represent actions
   * ---------------------------------------
   */
  class Tick {constructor(public readonly elapsed: number){}}
  class Move {constructor(public readonly xSpeed:number){}}
  class MouseMove {constructor(public readonly xSpeed: number){}}
  class Shoot {constructor(){}}
  class AlienShoot{constructor(public readonly rng1: RNG, public readonly rng2: RNG){}}
  class Command{constructor(){}}

  /** Type aliases for different payload types and relevant keypress
   * -----------------------------------------
   */
  type KeyAction = Move | Shoot | Command
  type KeyEvent = "keydown" | "keyup"
  type Key = "ArrowRight" | "ArrowLeft" | "Space" | "KeyR"


  /**Observable Streams
   * ---------------------------------------
   */
  
  //Functions to generate observables for key events
  const filterKey = (keyEvent: KeyEvent, keyName: Key) => 
            fromEvent<KeyboardEvent>(document, keyEvent).pipe(
              filter(({code}) => code === keyName),
              filter(({repeat}) => !repeat)), 
      observeKey = (keyEvent: KeyEvent, keyName: Key, f: () => KeyAction) => filterKey(keyEvent, keyName).pipe(map(f))

  //Mouse movement stream
  const mouseMovement = fromEvent<MouseEvent>(canvas, "mousemove").pipe(
    map(({movementX}) => new MouseMove(movementX)),
  )

  //Random stream to dictate alien shooting
  const randomNumberStream = (seed: number) =>interval(2000).pipe(scan((a, _) => a.next(), new RNG(seed)))
 
  //Streams
  const keyRightMove = observeKey("keydown", "ArrowRight",() => new Move(Constants.KeyRight)),
        keyRightStop = observeKey("keyup",  "ArrowRight",() => new Move(Constants.KeyLeft)),
        keyLeftMove = observeKey("keydown", "ArrowLeft",() => new Move(Constants.KeyLeft)),
        keyLeftStop = observeKey("keyup",  "ArrowLeft",() => new Move(Constants.KeyRight)),
        shoot = observeKey("keydown", "Space", () => new Shoot()),
        alienShoot = zip(randomNumberStream(1), randomNumberStream(2)).pipe(
          map(([x,y]) => new AlienShoot(x,y))
          ),
        restart = observeKey("keydown", "KeyR", () => new Command())

  //Game clock
  const gameFlow = interval(Constants.GameFrameRate).pipe(
    map(elapsed => new Tick(elapsed)),
    merge(keyRightMove, keyLeftMove, keyRightStop, keyLeftStop),
    merge(mouseMovement),
    merge(shoot, alienShoot),
    merge(restart),
    scan(reduceState, initialState)).subscribe(updateView)


  /** State management
   * ----------------------------------------
   * */ 

   //function to wrap around screen
   const wrap = ({x,y}:Vec) => new Vec((x < 0 ? x + CanvasSize : x > CanvasSize ? x - CanvasSize : x), y)

  //Transduce state
  function reduceState(s:State, e: KeyAction | MouseMove | Tick | AlienShoot | Command):State{
    return e instanceof Move ? {
      ...s,
      ship: {...s.ship, vel: s.ship.vel.add(new Vec(e.xSpeed, 0))}
    } : e instanceof MouseMove ? {
      ...s,
    ship: {...s.ship, pos: s.ship.pos.add(new Vec(e.xSpeed,0))}
    } : e instanceof AlienShoot ? 
      shootAlien(s, e)
    : e instanceof Shoot ? {
      ...s,
      bullets: s.bullets.concat([createBullet(String(s.objCount), s.time)(new Vec(s.ship.pos.x, ConstantVectors.ShipBlasterLocation))]),
      objCount: s.objCount + 1
    } : e instanceof Command ? {
      ...initialState,
      exit: s.bullets.concat(s.shields.map(({damage}) => damage).flat()),
      restart: true
    }: tick(s, e)
  }


  //Aliens shooting
  function shootAlien(s:State, e: AlienShoot): State{
    const bulletCount = Math.min(s.aliens.length, scaleRNG(e.rng1, Constants.AlienBulletLimit)),
          aliensShooting = decideAliens(s.aliens),
          alienPos = (rng: RNG) => aliensShooting[scaleRNG(rng, aliensShooting.length-1)].pos.add(new Vec(0,6));

    const fillArray = Array(bulletCount).fill(e.rng2),
          bulletArray = fillArray.map((_, i) =>fillArray.slice(0, i+1).reduce((acc, r)=>acc.next(),e.rng2))
          .map(alienPos)

    return {
      ...s,
      objCount: s.objCount + bulletArray.length - 1,
      bullets: s.bullets.concat(bulletArray.map((elem, i) =>
        createAlienBullet(String(s.objCount + i), s.time)(elem)
        ))
    }
  }

  //Decide which alien would shoot
  function decideAliens(aliens: ReadonlyArray<Body>){
    const sortedAliens = [...aliens].sort((a, b) => a.pos.x - b.pos.x),
          columnAliensMap = sortedAliens.reduce((acc:{[key:number]: Body[]}, alien:Body) => {
                return {...acc, [alien.pos.x]: [...(acc[alien.pos.x] || []), alien]}
          }, {} as {[key:number]: Body[]}),
          closestAliens = Object.values(columnAliensMap).map(column => 
                       column.sort((a,b) =>b.pos.y - a.pos.y)[0])
    return closestAliens
  }


  //Game clock tick
  function tick(s:State, e: Tick):State{

    //Helper methods
    const edge =(x:number) => Math.floor(x) === CanvasSize || Math.floor(x) === 0,
          expired = (b:Body) => (e.elapsed - b.createTime >= (CanvasSize/Constants.BulletSpeed)),
          moveBullets = (bullets: ReadonlyArray<Body>) => bullets.map(b => <Body>{
                ...b,
                pos: b.pos.subtract(b.vel)
          }); 
    
    const allAliensKilled = s.aliens.length ===  0,
          reachedEdge = s.aliens.reduce((acc, b) => acc || edge(b.pos.x), false),
          reachedBottom = s.aliens.reduce((acc,b) => acc || b.pos.y >= 550 , false),
          activeBullets = s.bullets.filter(not(expired)),      
          expiredBullets = s.bullets.filter(expired),
          alienBullets = activeBullets.filter(isAlienBullet),
          shipBullets = activeBullets.filter(not(isAlienBullet));

    //Collision data and score keeping
    const {allAlienShieldBullets, deadAliens, collidedShields, deadShip, collidedShieldDamages, damageAreaCollision} 
                  = handleCollisions(s, shipBullets, alienBullets),
          damagedShield = collidedShields.map(e => <Body>{...e, damage: e.damage.concat(collidedShieldDamages)}),
          score = deadAliens.reduce((acc, alien) => acc + AlienScores[AlienTypes[alien.row]], 0),
          hitBullets = except(allAlienShieldBullets)(damageAreaCollision)

        
    return allAliensKilled ? {
      ...initialState,
      exit: s.bullets,
      levelWon: true,
      level: s.level + 1,
      score: s.score
    } : {
      ...s,
      time: e.elapsed,
      ship: {...s.ship, pos: wrap(s.ship.pos.add(s.ship.vel))},
      bullets: except(moveBullets(activeBullets))(hitBullets),
      shields: except(s.shields)(collidedShields).concat(damagedShield),
      aliens: except(moveAliens(s.aliens, reachedEdge))(deadAliens),   
      exit: expiredBullets.concat(hitBullets),
      gameOver: deadShip.length != 0  || reachedBottom,
      score: s.score + score,
      levelWon: false,
      restart: false
    } 
  }

  const moveAliens = (aliens: ReadonlyArray<Body>, reachedEdge: boolean) => {
    const alienSpeedup = getAlienSpeedUp(aliens.length)
    return aliens.map(a => 
        reachedEdge 
          ? <Body>{...a,  pos:a.pos.subtract(a.vel.scale(alienSpeedup)).add(ConstantVectors.AlienYVelocity), vel: a.vel.scale(-1)}
          : <Body>{...a, pos: a.pos.add(a.vel.scale(alienSpeedup))}
    )
  }


  function handleCollisions(s:State, shipBullets: ReadonlyArray<Body>, alienBullets: ReadonlyArray<Body>){

    //Collision helper methods
    const withinRadius = (radius: number) => (coord: number) => Math.abs(coord) < radius,
          collided = (entity: Body) => (bullet: Body) => {
            return ((xRadiusFunc: (_:number) => boolean) => (yRadiusFunc: (_:number) => boolean) => {
              
              return xRadiusFunc(bullet.pos.subtract(entity.pos).x) && yRadiusFunc(bullet.pos.subtract(entity.pos).y)})(withinRadius(entity.radiusX))(withinRadius(entity.radiusY))
          },
          collidedBody = (bullets:ReadonlyArray<Body>) => (entity:Body) => {
            const collisions = bullets.filter(collided(entity))
            return collisions.length ? collisions.concat(entity) : []
          }
    

    const alienBulletCollisions: ReadonlyArray<Body> = s.aliens.reduce((acc, alien) => acc.concat(collidedBody(shipBullets)(alien)), []),
         shieldBulletCollisions: ReadonlyArray<Body> = s.shields.reduce((acc, shield)=>acc.concat(collidedBody(s.bullets)(shield)), []),
         allBullets = shipBullets.concat(alienBullets),
         damageAreaCollision = s.shields.reduce((res:ReadonlyArray<ReadonlyArray<Body>>, el:Body) => res.concat(el.damage.reduce((acc:ReadonlyArray<Body>, d:Body) => acc.concat(collidedBody(allBullets)(d)) ,[])), []).flat()

    const deadAliens = alienBulletCollisions.filter(isAlien),
          deadShip = collidedBody(alienBullets)(s.ship),
          collidedShields = shieldBulletCollisions.filter(isShield),
          shieldBullets = shieldBulletCollisions.filter(isBullet),
          allAlienShieldBullets = alienBulletCollisions.concat(shieldBullets)
  
   
    const collidedShieldDamages = collidedShields.map((e,i) => 
          createDamage(`${e.id}-${s.time}-${i}`, s.time)(shieldBullets[i].pos)
        )

    return {allAlienShieldBullets, deadAliens, collidedShields, deadShip, collidedShieldDamages, damageAreaCollision}
  }

  fromEvent<MouseEvent>(document, "mousedown").pipe(
    map(({pageX, pageY}) => [pageX-6, pageY-76])
  ).subscribe(console.log)



//Helper methods
  const getAlienSpeedUp = (count: number)  => 
            count >= 40 ? AlienSpeedup['low'] :
            count >= 30 ? AlienSpeedup['fine'] :
            count >= 10 ? AlienSpeedup['moderate'] : AlienSpeedup['high'],
        not = <T>(f:(x:T)=> boolean) => (x:T) => !f(x),
        elem = (a:ReadonlyArray<Body>) => (e:Body) => a.findIndex(b=>b.id === e.id) >= 0,
        except = (a:ReadonlyArray<Body>) => (b:ReadonlyArray<Body>) => a.filter(not(elem(b)))



  /** Displaying outputs: Side effects
   * The below functions are impure
   * ------------------------------------------
   *  */ 
  function updateView(s:State){
    const ship = document.getElementById("ship")!,
          score = document.getElementById("points")!,
          level = document.getElementById("level")!

    ship.setAttribute("transform", `translate(${s.ship.pos.x}, ${s.ship.pos.y})`)
    score.textContent = String(s.score)
    level.textContent = String(s.level)

    //Draw bodies on each tick
    handleBodyDraw(s)

   //Removing expired objects from the canvas
    s.exit.forEach(o => removeBody(canvas)(o))

    //Restart banner
    if(s.restart)    
      displayBannerInterval(canvas)( createTextBanner(canvas)({"x": String(CanvasSize/4),"y": String(CanvasSize/2),"class": "successBanner", "id": "restartText"})("Restart"))(1500)
    
    if (s.levelWon)
      displayBannerInterval(canvas)(createTextBanner(canvas)({"x": String(CanvasSize/5),"y": String(CanvasSize/2),"class": "successBanner", "id": "nextLevelText"})("Next Level"))(1500)
  

    if (s.gameOver){
        gameFlow.unsubscribe()
        const objCleanUp = s.bullets.concat(s.shields.map(({damage}) => damage).flat())

        createTextBanner(canvas)({"x": String(CanvasSize/5),"y": String(CanvasSize/2),"class": "failBanner", "id": "gameOverText"})("Game Over")
        listenForRestart(objCleanUp)
    }
  }

  //Provided a state object will draw all required objects on the canvas
  function handleBodyDraw(s:State){

     //Helper functions to draw bullets, aliens and shields
     const createBulletView = createView("bullet", "line")(canvas)
     const createAlienView = createView("alien", "path")(canvas)
     const createShieldView = createView("shield", "circle")(canvas)  
 
     //Drawing custom alien shapes 
     const drawAliens = (pred:(_:Body)=> boolean) => drawCustomBodies(createAlienView)(s.aliens.filter(pred));
 
     //Render bullets
     s.bullets.forEach(b => {
       setAttribute(getBodyElement(b, createBulletView))({"x1":String(b.pos.x), "x2":String(b.pos.x), "y1": String(b.pos.y),"y2": String(b.pos.y - Constants.BulletLength), "stroke": "white"})
     })
 
     //Render shield collisions
     s.shields.forEach(e => {
       e.damage.forEach(d => {
       setAttribute(getBodyElement(d,createShieldView))({"cx": String(d.pos.x), "cy": String(d.pos.y), "r":"3", "fill": "rgb(41, 41, 36)"})
     })})
    
    // Type 2 aliens
    drawAliens(a => a.row === 0)({"style":"fill:white;stroke-width:2px;"}, svgPathStrings.type1, 0.05)
 
    //Type 2 aliens
    drawAliens(a => a.row === 1 || a.row === 2)({"style":"fill:white;stroke-width:2px;"}, svgPathStrings.type2, 0.05)
 
    //Type 3 aliens
    drawAliens(a => a.row === 3 || a.row === 4)({"style":"fill:white;"}, svgPathStrings.type3, 1.18)
  }

//Called after game is over. Will listen for a KeyR event 
//Displays restart banner and restarts game
function listenForRestart(s: ReadonlyArray<Body>){

  filterKey("keydown", "KeyR").pipe(
    take(1),
    map(_ => s),
  ).subscribe(arr => {
    removeElement(canvas)("gameOverText")
    displayBannerInterval(canvas)(createTextBanner(canvas)({"x": String(CanvasSize/4),"y": String(CanvasSize/2),"class": "successBanner", "id": "restartText"})("Restart"))(1500)
    arr.forEach(o => removeElement(canvas)(o.id))
    spaceinvaders()
  })
}


type ObjectInput = {[key:string]: string}

//Display banner after a specified interval
const displayBannerInterval = (canvas: Element) => (e: Element) => (time:number) => 
            interval(time).pipe(take(1)).subscribe(_ => removeElement(canvas)(e.id)),


//Provided a body, will get it's correspoding element, if that element does not exist will
//create it, with a provided helper function
      getBodyElement = (body: Body, creator: (s:string) => Element) => 
            document.getElementById(body.id) || creator(body.id),

//Given a parent element and a body, will remove the body if not already removed
      removeBody = (canvas: Element) => (b: Body) => removeElement(canvas)(b.id),


//Given an array of bodies, will create elements from the array according to a specified 
//set of attributes
      drawCustomBodies =  (creator:(id:string)=> Element) => (bodies: ReadonlyArray<Body>) =>
                    (obj: ObjectInput, type:string, scale: number) => {
    
        bodies.forEach(a =>{
          const pos = applyShapeCorrection(a)
          const bodyElement = setAttribute(getBodyElement(a, creator))
          bodyElement({...obj, transform: `translate(${pos.x},${pos.y}) scale(${scale}) `, d: type})
        })
      }

      //Applies shape correction as svg element origin does not correspond to the center
  const applyShapeCorrection = (b: Body):Vec => {
    const shapeCorrection = ShapeCorrectionVectors[AlienTypes[b.row]]
    return shapeCorrection ? b.pos.add(shapeCorrection) : b.pos
  }
}

/**
 * Utility Classes and functions
 */

//Creates an element of a particular shape on a provided canvas and returns the created element
const createView = (viewType: string, shape:string) => (canvas: Element) => (id:string) => {
  const v = document.createElementNS(canvas.namespaceURI, shape)!;
  v.setAttribute("id", id)
  v.classList.add(viewType)
  canvas.appendChild(v)
  return v;
}

//Will set the attributes of an element, provided a <String, String> object containing the
//ids and attributes
const setAttribute= (e: Element) => (obj: {[key:string]: string}) => {
  for(const k in obj) e.setAttribute(k,String(obj[k]))
}

//Remove an element from a specified parent
const removeElement = (canvas: Element) => (id: string)=> {
  const v = document.getElementById(id)
  if (v) canvas.removeChild(v)
}
        

const createTextBanner = (canvas: Element) => (obj: {[key:string]: string}) => (text: string)=> {
  const v = document.createElementNS(canvas.namespaceURI, "text")!;
  setAttribute(v)(obj)
  v.textContent = text
  canvas.appendChild(v)
  return v
}


//An immutable vector class
//Reused from Tim Dwyer's Observable asteroids example at https://tgdwyer.github.io/asteroids/
class Vec{
    constructor(public readonly x: number, public readonly y:number){}
    add= (b:Vec) => new Vec(this.x +b.x, this.y+b.y)
    subtract = (b:Vec) => new Vec(this.x - b.x, this.y - b.y)
    len = () => Math.sqrt(this.x*this.x + this.y * this.y)
    scale = (s:number) => new Vec(this.x*s, this.y*s)
    static Zero = new Vec(0,0)
}
    
//An immutable random number class
//Instantiate by passing a seed
class RNG {
    // LCG using GCC's constants
    readonly m = 0x80000000// 2**31
    readonly a = 1103515245
    readonly c = 12345

    constructor(public readonly state: number){}

    int(){
      return (this.a * this.state + this.c) % this.m
    }

    float(){
      return this.int()/(this.m -1)
    }

    next(){
      return new RNG(this.int())
    }
}

//Scale a provided RNG class instance float value to [0..limit]
const scaleRNG = (rng: RNG, limit:number) => Math.round(rng.float() * limit)


//SVG Path strings 
//Obtained online:  Available for free use
// type 1: CCO license
//            https://www.svgrepo.com/svg/39400/rocket-space-vehicle-in-vertical-position
// type 2: Under the CCO license
//             https://www.svgrepo.com/svg/275959/space-invaders
// type 3 : Public domain license
//            https://freesvg.org/space-invaders-pixel-art-icon-vector-image
const svgPathStrings = {
  type1:`M427.322,479.1l-23-74c17.2-101.4-18.4-178.1-19.9-181.3L316.223,55c6.8-5.8,10.8-14.4,10.8-23.7c0-17.3-14-31.3-31.3-31.3
  s-31.3,14-31.3,31.3c0,9.2,4.1,17.8,10.8,23.7l-68.2,168.8c-1.5,3.2-37.1,79.899-19.9,181.3l-23,74c-0.9,2.801-0.4,6.1,1.3,8.6
  l55.3,79.5c1.8,2.602,4.8,5.102,7.8,5.102c0.1,0,0.1,0,0.2,0c5.3,0,9.6-5.201,9.6-10.5c0-1.301-0.3-3.5-0.7-4.602l-14.6-75.6
  l9-10.4c6.6,5.4,17.4,13.301,31.6,20.701l-6.7,23.1c-0.6,2.1-0.5,4.801,0.4,6.801l26.7,62.398c1.5,3.5,5,7.201,8.8,7.201
  c0.1,0,0.2,0,0.2,0c0.9,0,1.8-0.201,2.7-0.6c0.9,0.398,1.8,0.6,2.7,0.6c0.1,0,0.2,0,0.2,0c3.8,0,7.299-3.701,8.799-7.201
  l26.7-62.398c0.9-2,1-4.701,0.4-6.801l-6.7-23.1c14.2-7.4,24.9-15.301,31.6-20.701l9,10.4l-14.6,75.6
  c-0.5,1.102-0.7,3.301-0.7,4.602c0,5.299,4.3,10.5,9.601,10.5c0.1,0,0.1,0,0.199,0c3.101,0,6-2.4,7.801-5.102l55.3-79.5
  C427.723,485.199,428.122,481.9,427.322,479.1z M295.723,412.5c-41.4,0-75-33.6-75-75s33.6-75,75-75c41.399,0,75,33.6,75,75
  S337.122,412.5,295.723,412.5z`,
  type2: `M469.344,266.664v-85.328h-42.656v-42.672H384v-21.328h42.688v-64h-64v42.656H320v42.672H192V95.992
  h-42.656V53.336h-64v64H128v21.328H85.344v42.672H42.688v85.328H0v149.328h64v-85.328h21.344v85.328H128v42.672h106.688v-64h-85.344
  v-21.328h213.344v21.328h-85.344v64H384v-42.672h42.688v-85.328H448v85.328h64V266.664H469.344z M192,245.336h-64v-64h64V245.336z
   M384,245.336h-64v-64h64V245.336z`,
   type3: `m12.345 6.2426v2.4677h-5.4068v2.3845h-1.7797v7.3275h21.684v-7.3275h-1.8475v-2.3845h-5.339v-2.4677h-7.3107zm-1.7797 7.4107h3.5593v2.3845h-3.5593v-2.3845zm7.3107 0h3.5593v2.3845h-3.5593v-2.3845zm-7.3164 4.6515v2.5927h-1.8418v2.3845h-3.5593v2.4753h3.6215v-2.392h3.5593v-2.4677h1.8475v-2.5927h-3.6271zm3.6271 2.5927v2.4677h3.6215v-2.4677h-3.6215zm3.6215 0h1.7853v2.3845h3.6215v-2.4677h-1.7797v-2.5095h-3.6271v2.5927zm5.4068 2.3845v2.4753h3.6271v-2.4753h-3.6271z`
} as const

