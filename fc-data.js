(function () {
  const B = {
    qp(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } },
    lsGet(k, d) { try { const v = localStorage.getItem('fc.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    lsSet(k, v) { try { localStorage.setItem('fc.' + k, JSON.stringify(v)); } catch (e) {} },
    // en/es picked from the device, first entry the site can actually serve.
    // Pure, so it can be checked with a stub list: detectLang(['fr-FR','en-US']) === 'en'.
    detectLang(langs) {
      const list = langs && langs.length ? langs : [];
      for (const l of list) {
        const p = String(l).toLowerCase().split('-')[0];
        if (p === 'es' || p === 'en') return p;
      }
      return 'es';
    },
    // Explicit choice first (?lang=, then the Nav toggle's saved pick), device after.
    // Never persists what it detects — see setLang, the only writer of fc.lang.
    resolveLang() {
      const pick = this.qp('lang') || this.lsGet('lang', null);
      // Clamped, so ?lang=ES works and ?lang=fr can't end up in <html lang>.
      if (pick) return String(pick).toLowerCase() === 'es' ? 'es' : 'en';
      return this.detectLang(typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : null);
    },
    lang() { return (this.state && this.state.lang) || this.resolveLang(); },
    href(page, params) {
      const p = new URLSearchParams(), o = params || {};
      for (const k in o) if (o[k] !== null && o[k] !== undefined && o[k] !== '') p.set(k, o[k]);
      p.set('lang', this.lang());
      return page + '.dc.html?' + p.toString();
    },
    setLang(l) { this.lsSet('lang', l); const u = new URL(location.href); u.searchParams.set('lang', l); location.assign(u.toString()); },
    // ES/EV_ES below are the i18next resource bundle (loaded at the bottom of this
    // file). The direct lookup is the pre-init fallback — same output, no flash.
    T(s) {
      if (typeof s !== 'string' || this.lang() !== 'es') return s;
      const i = window.i18next;
      if (i && i.isInitialized) return i.t(s, { defaultValue: s });
      return this.ES[s] || this.EV_ES[s] || s;
    },
    tx(v) {
      if (typeof v === 'string') return this.T(v);
      if (Array.isArray(v)) return v.map(x => this.tx(x));
      if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = this.tx(v[k]); return o; }
      return v;
    },
    city(k) { return this.tx(this.CITIES[k]); },
    mount() {
      this._onResize = () => { if (this._rz) return; this._rz = requestAnimationFrame(() => { this._rz = null; this.setState({ vw: window.innerWidth }); }); };
      window.addEventListener('resize', this._onResize);
    },
    unmount() { window.removeEventListener('resize', this._onResize); if (this._rz) cancelAnimationFrame(this._rz); },
    saved() { return this.lsGet('saved', {}); },
    going() { return this.lsGet('going', {}); },
    savedCount() { const m = this.saved(); return Object.keys(m).filter(k => m[k]).length; },
    toggleFlag(kind, id) { const m = this[kind](); m[id] = !m[id]; this.lsSet(kind, m); this.setState({ tick: (this.state.tick || 0) + 1 }); },
    ticker() {
      const tk = this.T('NOW ON THE LISTING · 412 LOCAL SPOTS · HIALEAH · MIAMI LAKES · LITTLE HAVANA · MEMBER SPOTLIGHTS EVERY FRIDAY · NEW: BANQUET HALLS · ');
      const sp = String.fromCharCode(160, 160);
      return tk + sp + tk + sp;
    },
    ES: {
      "STORIES": "HISTORIAS",
      "LIST YOUR SPOT": "PON TU NEGOCIO",
      "LIST YOUR BUSINESS": "PON TU NEGOCIO",
      "NOW ON THE LISTING · 412 LOCAL SPOTS · HIALEAH · MIAMI LAKES · LITTLE HAVANA · MEMBER SPOTLIGHTS EVERY FRIDAY · NEW: BANQUET HALLS · ": "AHORA EN EL DIRECTORIO · 412 NEGOCIOS DE AQUÍ · HIALEAH · MIAMI LAKES · LA PEQUEÑA HABANA · SOCIOS EN CANDELA TODOS LOS VIERNES · NUEVO: SALONES DE FIESTA · ",
      "EVERY BUSINESS. THREE CITIES. ONE LISTING.": "TODOS LOS NEGOCIOS. TRES CIUDADES. UN SOLO DIRECTORIO.",
      "EAT, HIRE & CELEBRATE": "COME, CONTRATA Y CELEBRA",
      "WITH THE LOCALS.": "CON LA GENTE DE AQUÍ.",
      "Bars, restaurants, contractors, home cleaning and banquet halls — vouched for by the neighborhoods that use them. Pick a city up top to meet its crew.": "Bares, restaurantes, contratistas, limpieza de casas y salones de fiesta — respaldados por los barrios que los usan. Escoge una ciudad arriba y conoce a su pandilla.",
      "Search a business, dish or trade…": "Busca un negocio, un plato o un oficio…",
      "RESET": "BORRAR",
      "NEWSLETTER": "BOLETÍN",
      "DEALS IN YOUR INBOX EVERY FRIDAY": "OFERTAS EN TU CORREO CADA VIERNES",
      "One email a week: the spotlight deals, the new listings and where the crews are eating. No spam, ever.": "Un correo por semana: las ofertas en candela, los negocios nuevos y pa' dónde come la gente. Nada de spam.",
      "you@email.com": "tu@correo.com",
      "SIGN ME UP": "APÚNTAME",
      "YOU'RE IN — SEE YOU FRIDAY.": "YA ESTÁS DENTRO — NOS VEMOS EL VIERNES.",
      "FRIDAYS ONLY · ENGLISH OR SPANISH · UNSUBSCRIBE ANYTIME": "SOLO VIERNES · INGLÉS O ESPAÑOL · CANCELA CUANDO QUIERAS",
      "SPOTLIGHT": "EN CANDELA",
      "WHERE THE CREWS ARE GOING OUT THIS WEEK": "PA' DÓNDE SALE LA PANDILLA ESTA SEMANA",
      "THIS WEEK": "ESTA SEMANA",
      "SEE THE SPOT →": "VER EL LUGAR →",
      "FILTER:": "FILTRAR:",
      "MEMBER": "SOCIO",
      "DETAILS →": "VER MÁS →",
      "NOTHING HERE YET — TRY ANOTHER FILTER.": "AQUÍ NO HAY NADA TODAVÍA — PRUEBA OTRO FILTRO.",
      "OWN A SPOT IN ONE OF THE THREE?": "¿TIENES NEGOCIO EN UNA DE LAS TRES?",
      "Get your listing, your story page and a shot at the weekly spotlight.": "Tu ficha, tu página de historia y la chance de salir en candela el viernes.",
      "CITY PAGE": "PÁGINA DE LA CIUDAD",
      "BROWSE": "VER LOS",
      "LISTINGS": "NEGOCIOS",
      "LISTING": "NEGOCIO",
      "TOP OF THE CITY": "LO MEJOR DE LA CIUDAD",
      "← ALL LISTINGS": "← TODOS LOS NEGOCIOS",
      "Drop the hero shot — dining room, bar, storefront": "Suelta la foto principal — el salón, la barra, la fachada",
      "REVIEWS": "RESEÑAS",
      "VERIFIED MEMBER": "SOCIO VERIFICADO",
      "ALL LISTINGS": "TODAS LAS FICHAS",
      "THE STORY": "LA HISTORIA",
      "READ THE FULL STORY →": "LEE LA HISTORIA COMPLETA →",
      "WHAT THEY DO": "LO QUE HACEN",
      "VISIT": "VISÍTALOS",
      "GOING WITH THE CREW?": "¿VAS CON LA PANDILLA?",
      "ALSO IN": "TAMBIÉN EN",
      "MEMBERSHIP": "MEMBRESÍA",
      "GET FOUND BY YOUR OWN NEIGHBORHOOD.": "QUE TU PROPIO BARRIO TE ENCUENTRE.",
      "Your listing on your own city page, a full story page, your service list, and rotation into the Friday spotlight.": "Tu ficha en la página de tu ciudad, una página de historia completa, tu lista de servicios, y entrada a la rotación del destacado del viernes.",
      "CLAIM YOUR LISTING": "RECLAMA TU FICHA",
      "BUSINESS NAME": "NOMBRE DEL NEGOCIO",
      "OWNER": "DUEÑO",
      "CITY": "CIUDAD",
      "CATEGORY": "CATEGORÍA",
      "PHONE OR EMAIL": "TELÉFONO O CORREO",
      "TELL US THE STORY (WE WRITE THE PAGE FOR YOU)": "CUÉNTANOS LA HISTORIA (LA PÁGINA LA ESCRIBIMOS NOSOTROS)",
      "Your name": "Tu nombre",
      "Opened in 1994 by my abuela…": "La abrió mi abuela en el 94…",
      "Little Havana": "La Pequeña Habana",
      "Bars & Restaurants": "Bares y Restaurantes",
      "Night Clubs": "Clubes Nocturnos",
      "Contractors": "Contratistas",
      "Home Cleaning": "Limpieza de Casas",
      "Banquet Halls": "Salones de Fiesta",
            "THE CREWS ARE WAITING": "LAS PANDILLAS TE ESPERAN",
      "Every member gets their city mascot on their card — that is how locals spot who is one of theirs.": "Cada socio lleva la mascota de su ciudad en su ficha — así la gente de aquí sabe quién es de los suyos.",
      "TOLD BY THE OWNERS · WRITTEN BY US": "LO CUENTAN LOS DUEÑOS · LO ESCRIBIMOS NOSOTROS",
      "THE LONG READS — NEW ONE EVERY OTHER FRIDAY": "LAS CRÓNICAS — UNA NUEVA CADA DOS VIERNES",
      "GET YOUR SHOP ON THE MAP": "PON TU NEGOCIO EN EL MAPA",
      "THE STORIES": "LAS HISTORIAS",
      "BEHIND THE DOORS": "DETRÁS DE LAS PUERTAS",
      "Every listing on Flamingo County is a person who signed a lease and decided to stay. These are the long versions — read them slow, the pictures come to you.": "Cada ficha de Flamingo County es una persona que firmó un contrato de alquiler y decidió quedarse. Estas son las versiones largas — léelas despacio, las fotos vienen a ti.",
      "STORIES SO FAR": "HISTORIAS HASTA AHORA",
      "NEW ONE EVERY OTHER FRIDAY": "UNA NUEVA CADA DOS VIERNES",
      "FEATURED STORY": "HISTORIA DESTACADA",
      "READ THE STORY →": "LEE LA HISTORIA →",
      "ALSO ON THE SHELF": "TAMBIÉN EN EL ESTANTE",
      "READ →": "LEER →",
      "YOUR STORY GOES HERE": "AQUÍ VA TU HISTORIA",
      "Tell us how it started and who still shows up at 6am. We sit down with you, we write it, you approve it. Members only — it comes with the listing.": "Cuéntanos cómo empezó y quién sigue apareciendo a las 6 de la mañana. Nos sentamos contigo, la escribimos, tú la apruebas. Solo pa' socios — viene con la ficha.",
      "GET INTERVIEWED →": "QUE TE ENTREVISTEMOS →",
      "← ALL STORIES": "← TODAS LAS HISTORIAS",
      "SCROLL — THE PICTURES COME WITH YOU": "BAJA — LAS FOTOS VAN CONTIGO",
      "GO SEE IT YOURSELF.": "VE Y VELO TÚ MISMO.",
      "READ ANOTHER": "LEE OTRA",
      "Hialeah · Miami Lakes · Little Havana": "Hialeah · Miami Lakes · La Pequeña Habana",
      "a local listing, run by locals. © 2026": "un directorio del barrio, hecho por gente del barrio. © 2026",
      "ALL CITIES": "TODAS LAS CIUDADES",
      "ALL THREE CITIES": "LAS TRES CIUDADES",
      "{city} ONLY": "SOLO {city}",
      "LITTLE HAVANA": "LA PEQUEÑA HABANA",
      "Growing Beautifully": "Creciendo Bonito",
      "Calle Ocho Forever": "La Calle Ocho pa' Siempre",
      "Palm Avenue to 49th Street: bakeries that open at 5am, body shops that know your car, and a supper club scene that dresses up for it. The flamingos run this town.": "De Palm Avenue a la 49: panaderías que abren a las 5 de la mañana, talleres que ya conocen tu carro y supper clubs donde la gente todavía se viste pa' salir. Aquí mandan los flamencos.",
      "Main Street patios, roundabouts, and a town center built for walking. Family businesses that have handled three generations of the same houses. The cows keep it steady.": "Los patios de Main Street, las rotondas y un centro hecho pa' caminar. Negocios de familia que le han dado mantenimiento a tres generaciones de las mismas casas. Las vacas mantienen la calma.",
      "Domino Park, ventanitas, live son spilling onto the sidewalk after midnight. Cigar rollers and cantinas that never needed a rebrand. The roosters never sleep.": "El Parque del Dominó, las ventanitas y el son en vivo saliéndose a la acera después de medianoche. Torcedores de tabaco y cantinas que nunca necesitaron cambiar de nombre. Los gallos aquí no duermen.",
      "EVERYTHING": "TODO",
      "BARS & RESTAURANTS": "BARES Y RESTAURANTES",
      "NIGHT CLUBS": "CLUBES NOCTURNOS",
      "CONTRACTORS": "CONTRATISTAS",
      "HOME CLEANING": "LIMPIEZA DE CASAS",
      "BANQUET HALLS": "SALONES DE FIESTA",
      "White tablecloths, a house trio, and the best palomilla north of the Miami River.": "Mantel blanco, trío de la casa y la mejor palomilla al norte del río Miami.",
      "Dining room at night": "El salón de noche",
      "Croquetas out of the fryer at 6am and pan cubano still warm at noon.": "Croquetas saliendo de la freidora a las 6 de la mañana y pan cubano todavía calientico al mediodía.",
      "Bakery counter": "El mostrador de la panadería",
      "Third-generation roofers. Permits pulled, tile matched, no ghosting after the deposit.": "Techadores de tercera generación. Sacan los permisos, igualan la teja y no desaparecen después del depósito.",
      "Crew on a roof": "La cuadrilla arriba del techo",
      "400 seats, a real dance floor, and a quinceañera package your tía will approve.": "400 sillas, pista de baile de verdad y un paquete de quince que tu tía aprueba.",
      "Hall set for a party": "El salón montado pa' la fiesta",
      "Reggaetón downstairs, timba upstairs, croquetas at 3am from the window out back.": "Regueton abajo, timba arriba y croquetas a las 3 de la mañana por la ventanita de atrás.",
      "Club dance floor": "La pista del club",
      "Dry-aged steaks, a patio under the oaks, and a kids menu that is not an afterthought.": "Carnes maduradas, un patio debajo de los robles y un menú de niños que sí lo pensaron.",
      "Patio dinner table": "Mesa en el patio",
      "Same two-person team every visit. Deep clean, move-outs, and post-party rescues.": "El mismo par de personas en cada visita. Limpieza profunda, mudanzas y rescates después de la fiesta.",
      "Spotless kitchen": "Una cocina impecable",
      "Same-day A/C repair in August, which is the only month that counts.": "Arreglan el aire el mismo día en agosto, que es el único mes que cuenta.",
      "Technician at work": "El técnico trabajando",
      "Weddings, sweet sixteens and Sunday church luncheons under one very tall ceiling.": "Bodas, quince y almuerzos de la iglesia el domingo bajo un techo bien alto.",
      "Wedding reception": "Una recepción de boda",
      "Ropa vieja, a nine-piece band on Thursdays, and mojitos poured with too much rum.": "Ropa vieja, una banda de nueve los jueves y mojitos con demasiado ron.",
      "Cantina bar": "La barra de la cantina",
      "Rollers up front, rum in the back, dominoes going until the last table gives up.": "Torcedores al frente, ron atrás y dominó hasta que se rinda la última mesa.",
      "Cigar lounge": "El salón de tabaco",
      "A colada, a pastelito, and the loudest political debate on the block. Free with purchase.": "Una colada, un pastelito y el debate político más gritado de la cuadra. Va incluido en la compra.",
      "Ventanita window": "La ventanita",
      "Old tile floors, string lights, and a stage that has held every kind of band.": "Pisos de losa vieja, luces colgadas y una tarima que ha aguantado to' tipo de banda.",
      "Event hall stage": "La tarima del salón",
      "Apartment turnovers, post-renovation dust, and windows that finally see the street.": "Apartamentos entre inquilinos, polvo de remodelación y ventanas que por fin ven la calle.",
      "Cleaning crew": "La cuadrilla de limpieza",
      "SUPPER CLUB · DATE NIGHT": "SUPPER CLUB · NOCHE DE PAREJA",
      "2-for-1 mojitos, Thursday to Saturday, 7–9pm": "2 por 1 en mojitos, de jueves a sábado, 7–9pm",
      "Rafa books the corner booth and Yoli makes him wear the good guayabera. Live trio starts at nine.": "Rafa reserva el rincón y Yoli lo obliga a ponerse la guayabera buena. El trío arranca a las nueve.",
      "STEAKHOUSE · FAMILY TABLE": "PARRILLADA · MESA DE FAMILIA",
      "Sunday family platter for four — $68": "Fuente familiar del domingo pa' cuatro — $68",
      "The whole herd shows up after church. Kids eat on the patio, Toni argues about the check.": "La manada entera cae después de la iglesia. Los niños comen en el patio y Toni discute la cuenta.",
      "CANTINA · LIVE MUSIC": "CANTINA · MÚSICA EN VIVO",
      "Live son cubano Thursdays, no cover before 10pm": "Son cubano en vivo los jueves, sin cover antes de las 10",
      "Rigo brings Blanca and Daysi, orders three ropa viejas, and nobody leaves before last call.": "Rigo llega con Blanca y Daysi, pide tres ropa vieja y nadie se va antes del último trago.",
      "Rigoberto Peña opened El Gallo in 1994 with eight tables, a rice cooker and a hand-painted sign his brother made in one afternoon. The sign is still over the door. It has been repainted four times.": "Rigoberto Peña abrió El Gallo en 1994 con ocho mesas, una arrocera y un letrero pintado a mano que le hizo su hermano en una tarde. El letrero sigue arriba de la puerta. Lo ha repintado cuatro veces.",
      "The kitchen has never had a written menu longer than one page. Ropa vieja on Monday, oxtail on Wednesday, and whatever the fish guy brought in on Friday. Regulars stopped asking and just say \"lo de siempre.\"": "La cocina nunca ha tenido un menú escrito de más de una página. Ropa vieja el lunes, rabo encendido el miércoles y lo que trajo el pescadero el viernes. Los del barrio dejaron de preguntar y ya solo dicen lo de siempre.",
      "On Thursdays the tables get pushed to the wall for the band. It is nine pieces, it is loud, and the neighbors gave up complaining in about 2003.": "Los jueves empujan las mesas contra la pared pa' la banda. Son nueve músicos, suena durísimo, y los vecinos dejaron de quejarse allá por el 2003.",
      "You do not come here for the decoration. You come because your grandmother would approve of the black beans.": "Aquí no se viene por la decoración. Se viene porque tu abuela aprobaría estos frijoles negros.",
      "RIGO PEÑA, OWNER": "RIGO PEÑA, DUEÑO",
      "KITCHEN OPEN UNTIL 1AM": "COCINA ABIERTA HASTA LA 1AM",
      "Shredded brisket, peppers, white rice, sweet plantains": "Falda desmenuzada, ajíes, arroz blanco y plátano maduro",
      "Slow-roasted pork shoulder, mojo, yuca con mojo": "Masa de puerco asada lento, mojo y yuca con mojo",
      "Fried to order. Do not ask for the recipe.": "Fritas al momento. No pidas la receta.",
      "Marinated overnight, black beans, moros": "Adobado desde la noche antes, frijoles negros y moros",
      "Too much rum. Intentionally.": "Demasiado ron. A propósito.",
      "One size. One answer.": "Un tamaño. Una respuesta.",
      "Mon – Wed": "Lun – Mié",
      "Thu (Live band)": "Jue (banda en vivo)",
      "Fri – Sat": "Vie – Sáb",
      "Sunday": "Domingo",
      "Mon – Fri": "Lun – Vie",
      "Saturday": "Sábado",
      "By appointment": "Con cita",
      "Emergencies": "Emergencias",
      "Call anytime": "Llama a cualquier hora",
      "CALL FOR A TABLE": "LLAMA PA' RESERVAR",
      "REQUEST A QUOTE": "PIDE UN ESTIMADO",
      "Rigo, Blanca and Daysi hold the front table on Thursdays. Say hello, do not sit in it.": "Rigo, Blanca y Daysi tienen la mesa del frente los jueves. Saluda, pero no te sientes ahí.",
      "We do the work, the block does the advertising.": "Nosotros hacemos el trabajo, la cuadra hace la publicidad.",
      "OWNER, ": "DUEÑO DE ",
      "{name} has been working {city} addresses long enough that the neighbors call the owner by first name. No franchise, no call center, no script.": "{name} lleva trabajando direcciones de {city} el tiempo suficiente pa' que los vecinos llamen al dueño por su nombre. Sin franquicia, sin call center, sin guión.",
      "The listing page for this business is waiting on its story. Members send us the history — how it started, who runs it now, what they will not change — and we write this section for them.": "La página de este negocio está esperando su historia. Los socios nos mandan la historia — cómo empezó, quién la lleva ahora, qué no piensan cambiar — y nosotros escribimos esta sección por ellos.",
      "Until then: they show up, they pick up the phone, and the reviews below are from people on these same streets.": "Mientras tanto: aparecen, cogen el teléfono, y las reseñas de abajo son de gente de estas mismas calles.",
      "Members of the {city} crew get first callback. Mention the listing.": "Los socios de la pandilla de {city} reciben la primera llamada de vuelta. Menciona el directorio.",
      "Estimates on request": "Estimados cuando los pidas",
      "On site within 48 hours, written before they leave.": "En tu casa en 48 horas, por escrito antes de irse.",
      "Licensed & insured": "Con licencia y seguro",
      "State license and certificate of insurance on file with us.": "Licencia estatal y certificado de seguro archivados con nosotros.",
      "Warranty": "Garantía",
      "One year on labor, manufacturer coverage on parts.": "Un año en mano de obra, cobertura del fabricante en piezas.",
      "Bilingual crew": "Cuadrilla bilingüe",
      "English and Spanish, on every job.": "Inglés y español, en cada trabajo.",
      "Drop: ": "Suelta: ",
      "Drop the spotlight photo — ": "Suelta la foto del destacado — ",
      "Drop: interior": "Suelta: el interior",
      "Drop: a signature plate": "Suelta: un plato de la casa",
      "Drop: work in progress": "Suelta: el trabajo en proceso",
      "Drop: the people": "Suelta: la gente",
      "LISTED BUSINESSES": "NEGOCIOS LISTADOS",
      "VERIFIED MEMBERS": "SOCIOS VERIFICADOS",
      "NEIGHBORHOODS": "BARRIOS",
      "AVERAGE RATING": "PROMEDIO DE ESTRELLAS",
      "Listed in your own city": "Listado en tu propia ciudad",
      "One listing on your city page, plus the main directory everyone lands on.": "Una ficha en la página de tu ciudad, más el directorio principal donde cae todo el mundo.",
      "NFC card + a landing page": "Tarjeta NFC + una página de aterrizaje",
      "We print your tap-to-open card and build the landing page it opens — hours, directions, all of it.": "Te imprimimos la tarjeta de un toque y te hacemos la página que abre — horario, cómo llegar, todo.",
      "QR codes, hosted by us": "Códigos QR, alojados por nosotros",
      "BETA · AI RECEPTIONIST": "BETA · RECEPCIONISTA IA",
      "WE'RE LOOKING FOR BETA TESTERS.": "BUSCAMOS NEGOCIOS PARA PROBARLA.",
      "Our AI receptionist answers your phone in English or Spanish, takes reservations and texts you the details. Tell us in the form below if you want in.": "Nuestra recepcionista de IA contesta en inglés o español, toma reservaciones y te manda los detalles por mensaje. Dinos en el formulario de abajo si te interesa.",
      "Promo or contact QR codes we host for you. Change where they point anytime, the sticker stays the same.": "Códigos QR de promoción o contacto que nosotros alojamos. Cambia a dónde apuntan cuando quieras, la pegatina sigue igual.",
      "A real story page": "Una página de historia de verdad",
      "We interview you and write it. Services, hours, gallery included.": "Te entrevistamos y la escribimos. Servicios, horario y galería incluidos.",
      "Spotlight rotation": "Rotación en candela",
      "Restaurants, bars and clubs rotate through the Friday spotlight with your own promo.": "Restaurantes, bares y clubes rotan en el destacado del viernes con su propia promoción.",
      "Your city mascot": "La mascota de tu ciudad",
      "The flamingo, the cow or the rooster on your card. Locals know what it means.": "El flamenco, la vaca o el gallo en tu ficha. La gente de aquí sabe lo que significa.",
      "LITTLE HAVANA · SINCE 1994": "LA PEQUEÑA HABANA · DESDE 1994",
      "HIALEAH · SINCE 1981": "HIALEAH · DESDE 1981",
      "MIAMI LAKES · SINCE 2016": "MIAMI LAKES · DESDE 2016",
      "6 MIN READ": "6 MIN DE LECTURA",
      "5 MIN READ": "5 MIN DE LECTURA",
      "4 MIN READ": "4 MIN DE LECTURA",
      "AS TOLD TO FLAMINGO COUNTY": "CONTADO A FLAMINGO COUNTY",
      "SEE THE LISTING →": "VER LA FICHA →",
      "THE SIGN HIS BROTHER PAINTED": "EL LETRERO QUE PINTÓ SU HERMANO",
      "Rigo Peña opened a cantina with eight tables and a secondhand rice cooker. Thirty-two years later, the one thing he refuses to replace is a piece of plywood.": "Rigo Peña abrió una cantina con ocho mesas y una arrocera de segunda mano. Treinta y dos años después, lo único que se niega a cambiar es un pedazo de plywood.",
      "Drop the cover shot — El Gallo storefront at dusk, sign lit": "Suelta la foto de portada — la fachada de El Gallo al atardecer, con el letrero prendido",
      "FIG. 1 — 1412 SW 8th St. The rooster has faced this sidewalk since October 1994.": "FIG. 1 — 1412 SW 8th St. El gallo mira pa' esta acera desde octubre del 94.",
      "The first thing Rigoberto Peña bought for El Gallo was not a stove. It was a rice cooker, secondhand, from a place on Flagler that had closed for good the week before. He paid eleven dollars for it and carried it home on the bus with the lid taped down.": "Lo primero que Rigoberto Peña compró pa' El Gallo no fue una estufa. Fue una arrocera, de uso, de un lugar en Flagler que había cerrado pa' siempre la semana anterior. Pagó once dólares por ella y se la llevó en la guagua con la tapa pegada con tape.",
      "The second thing was plywood. His brother Néstor painted the sign on the sidewalk out front in one afternoon — a rooster mid-crow, one eye open, in a red nobody has been able to match since. Rigo told him it was temporary. Néstor said fine.": "Lo segundo fue plywood. Su hermano Néstor pintó el letrero en la acera del frente en una tarde — un gallo cantando, un ojo abierto, en un rojo que nadie ha podido igualar desde entonces. Rigo le dijo que era temporal. Néstor le dijo está bien.",
      "the hand-painted sign over the door, close up": "el letrero pintado a mano arriba de la puerta, de cerca",
      "FIG. 2 — Repainted four times. Never redrawn. Rigo traces the same lines with a two-inch brush.": "FIG. 2 — Repintado cuatro veces. Nunca redibujado. Rigo repasa las mismas líneas con una brocha de dos pulgadas.",
      "Every few years the sun eats it and I go up the ladder. Same lines. I am not an artist. I am a tracer.": "Cada par de años el sol se lo come y yo subo la escalera. Las mismas líneas. Yo no soy artista, yo repaso.",
      "The kitchen has never had a written menu longer than one page. Monday is ropa vieja. Wednesday is oxtail. Friday is whatever the fish guy brought in that morning, and if you ask what that is, the answer is a shrug and a good price. Regulars stopped asking around 1999. Now they just say lo de siempre and sit down.": "La cocina nunca ha tenido un menú escrito de más de una página. El lunes es ropa vieja. El miércoles, rabo encendido. El viernes es lo que trajo el pescadero esa mañana, y si preguntas qué es, la respuesta es un encogimiento de hombros y un buen precio. Los del barrio dejaron de preguntar como en el 99. Ahora dicen lo de siempre y se sientan.",
      "ropa vieja plated, overhead": "la ropa vieja emplatada, desde arriba",
      "Monday. Nine hours in the pot, no exceptions.": "Lunes. Nueve horas en la olla, sin excepción.",
      "the kitchen pass at 8pm, tickets up": "la ventanilla de la cocina a las 8pm, con las órdenes colgadas",
      "Eight tickets deep and nobody is shouting. That took twenty years.": "Ocho órdenes atrasadas y nadie está gritando. Eso tomó veinte años.",
      "THE ONE-PAGE RULE": "LA REGLA DE UNA PÁGINA",
      "Rigo has turned down four different consultants who wanted to expand the menu. His argument every time: a long menu means a freezer, and a freezer means Tuesday tastes like Monday.": "Rigo le ha dicho no a cuatro consultores que querían agrandar el menú. Su argumento es siempre el mismo: menú largo significa congelador, y congelador significa que el martes sabe igual que el lunes.",
      "On Thursdays the tables get pushed against the wall for the band. It is nine pieces. It is loud in a way that the room was not designed for, and that is the point — the trumpet player stands where table six used to be, and the whole place turns into one long conversation about who is dancing badly.": "Los jueves empujan las mesas contra la pared pa' la banda. Son nueve músicos. Suena más alto de lo que el local aguanta, y esa es justo la idea — el trompetista se para donde antes estaba la mesa seis y el lugar entero se convierte en una sola conversación sobre quién está bailando mal.",
      "the nine-piece band, Thursday night, room packed": "la banda de nueve, jueves por la noche, el local repleto",
      "FIG. 3 — The neighbors filed complaints until about 2003. Two of them now hold a standing reservation.": "FIG. 3 — Los vecinos se quejaron hasta como el 2003. Dos de ellos ahora tienen reservación fija.",
      "Daysi, his daughter, runs the books now and has for six years. She modernized almost everything: card reader, payroll, a delivery app Rigo pretends not to understand. When she brought up a new sign — clean type, backlit, the kind Calle Ocho is filling up with — he did not argue with her. He just went out to the storage room and showed her the four cans of red he keeps for it.": "Daysi, su hija, lleva los libros desde hace seis años. Modernizó casi todo: lector de tarjetas, nómina, una app de delivery que Rigo finge no entender. Cuando ella mencionó un letrero nuevo — tipografía limpia, iluminado por detrás, de esos que están llenando la Calle Ocho — él no discutió. Solo fue al cuarto del fondo y le enseñó las cuatro latas de rojo que guarda pa' eso.",
      "She can change anything she wants. When I am gone she will still know which red.": "Ella puede cambiar lo que quiera. Cuando yo no esté, ella todavía va a saber cuál rojo es.",
      "THE 4:40 SHIFT": "EL TURNO DE LAS 4:40",
      "At Panadería El Progreso the day starts in the dark, and it has started that way for forty-five years — first with Odalys, now with her son and a very serious thermometer.": "En la Panadería El Progreso el día empieza a oscuras, y así ha empezado por cuarenta y cinco años — primero con Odalys, ahora con su hijo y un termómetro muy serio.",
      "Drop the cover shot — bakery counter before opening, warm light": "Suelta la foto de portada — el mostrador de la panadería antes de abrir, con luz cálida",
      "FIG. 1 — E 4th Ave, 4:52am. The first tray of pan cubano comes out in eight minutes.": "FIG. 1 — E 4th Ave, 4:52am. La primera bandeja de pan cubano sale en ocho minutos.",
      "Odalys Ferrer opened the bakery in 1981 in a unit that had been a laundromat, which is why there is a floor drain in the middle of the sales floor that no one has ever bothered to explain to a health inspector.": "Odalys Ferrer abrió la panadería en 1981 en un local que había sido lavandería, que es la razón por la que hay un desagüe en medio del piso de venta que nadie le ha explicado nunca a un inspector de sanidad.",
      "She worked the 4:40 shift alone for eleven years. Her son Ernesto started coming with her when he was nine because there was nobody to leave him with, and he did his homework on flour sacks near the oven where it was warm.": "Trabajó el turno de las 4:40 sola por once años. Su hijo Ernesto empezó a acompañarla cuando tenía nueve, porque no había con quién dejarlo, y hacía la tarea encima de los sacos de harina, cerca del horno, donde hacía calorcito.",
      "the old deck oven, door open, trays going in": "el horno viejo de piso, la puerta abierta, entrando las bandejas",
      "FIG. 2 — The deck oven is original. It has been rebuilt twice and moved once, four feet to the left, in 1996.": "FIG. 2 — El horno es el original. Lo han reconstruido dos veces y lo movieron una, cuatro pies a la izquierda, en el 96.",
      "My mother did not teach me a recipe. She taught me what the dough is supposed to feel like at ten to five.": "Mi madre no me enseñó una receta. Me enseñó cómo se tiene que sentir la masa a las cinco menos diez.",
      "Ernesto runs it now and he is, by his own admission, the difficult one. He bought a digital probe thermometer in 2014 and started writing hydration percentages on a whiteboard in the back. His mother, who still comes in on Saturdays, calls the whiteboard el altar.": "Ernesto lo lleva ahora y es, según él mismo, el complicado. Compró un termómetro digital en 2014 y empezó a escribir porcentajes de hidratación en una pizarra en el fondo. Su madre, que todavía viene los sábados, le dice a la pizarra el altar.",
      "croquetas coming out of the fryer": "las croquetas saliendo de la freidora",
      "Ham croquetas. Six for nine dollars, unchanged for three years.": "Croquetas de jamón. Seis por nueve dólares, sin cambio en tres años.",
      "the morning line out the door": "la cola de la mañana saliendo por la puerta",
      "6:15am. Nurses coming off overnight, roofers going on.": "6:15am. Enfermeras saliendo del turno de noche, techadores entrando al suyo.",
      "WHAT SELLS OUT FIRST": "LO QUE SE ACABA PRIMERO",
      "Pastelitos de guayaba by 7:30. Croquetas by 9 on a weekday. The Saturday cake case is picked clean by noon, mostly by people who ordered ahead and still show up early to make sure.": "Los pastelitos de guayaba a las 7:30. Las croquetas a las 9 en día de semana. La vitrina de cakes del sábado queda vacía al mediodía, casi toda por gente que ordenó por adelantado y aun así llega temprano pa' asegurarse.",
      "The line outside at 6am is the same line as 1985, one generation over: night-shift nurses on the way home, framers on the way out, and two men who have been arguing about the same baseball season since before the bakery had a phone number.": "La cola de las 6 de la mañana es la misma cola del 85, una generación más adelante: enfermeras del turno de noche de camino a casa, carpinteros de camino al trabajo, y dos hombres que llevan discutiendo la misma temporada de pelota desde antes de que la panadería tuviera teléfono.",
      "loaves of pan cubano cooling on the rack": "las flautas de pan cubano enfriándose en el estante",
      "FIG. 3 — Still warm at noon. That is the entire marketing strategy.": "FIG. 3 — Todavía caliente al mediodía. Esa es toda la estrategia de mercadeo.",
      "Odalys, who is seventy-nine, does not work the ovens anymore. She sits at the second table by the window on Saturdays and watches the register, and if the line gets long she gets up and starts bagging without being asked, which drives her son crazy, and which he has stopped mentioning.": "Odalys, que tiene setenta y nueve, ya no trabaja los hornos. Se sienta en la segunda mesa junto a la ventana los sábados y vigila la caja, y si la cola se pone larga se levanta y empieza a embolsar sin que nadie le diga, cosa que enloquece a su hijo, y que él ya dejó de mencionar.",
      "THE SAME TWO PEOPLE, EVERY TIME": "LAS MISMAS DOS PERSONAS, SIEMPRE",
      "Two sisters built a cleaning company on one rule that costs them money and keeps every client they have ever had.": "Dos hermanas montaron una compañía de limpieza sobre una sola regla que les cuesta dinero y les conserva a todos los clientes que han tenido.",
      "Drop the cover shot — the two-person team in a client kitchen, van keys on counter": "Suelta la foto de portada — el dúo en la cocina de una clienta, las llaves de la van en el mostrador",
      "FIG. 1 — Royal Oaks, Tuesday. Dania takes the kitchen, Yaneisy takes the bathrooms. Always.": "FIG. 1 — Royal Oaks, martes. Dania coge la cocina, Yaneisy coge los baños. Siempre.",
      "Dania Sardiñas cleaned houses for a national franchise for six years. The crew she was assigned to changed almost every week, and so every Monday she was explaining to a stranger which cabinet the dog food lived in.": "Dania Sardiñas limpió casas para una franquicia nacional por seis años. La cuadrilla que le asignaban cambiaba casi cada semana, así que todos los lunes le estaba explicando a un extraño en qué gabinete vivía la comida del perro.",
      "She quit in 2016, called her sister Yaneisy, and they wrote down one rule before they took a single job: the same two people go to the same houses, forever. No rotating crews. No subcontractors. If they are booked, they say booked.": "Se fue en 2016, llamó a su hermana Yaneisy y escribieron una sola regla antes de coger el primer trabajo: las mismas dos personas van a las mismas casas, pa' siempre. Sin cuadrillas rotativas. Sin subcontratos. Si están llenas, dicen que están llenas.",
      "Anybody can clean a kitchen. Knowing that the mother-in-law is coming Friday, that is the job.": "Cualquiera limpia una cocina. Saber que la suegra llega el viernes, ese es el trabajo.",
      "supply caddy, labeled, in the van": "la caja de productos, etiquetada, dentro de la van",
      "Everything fits in two caddies. On purpose — a bigger van means a bigger crew.": "Todo cabe en dos cajas. A propósito — una van más grande significa una cuadrilla más grande.",
      "a finished kitchen, late afternoon light": "una cocina terminada, con luz de la tarde",
      "Three hours, two people. They have not been faster since 2019 and are not trying to be.": "Tres horas, dos personas. No van más rápido desde 2019 y no lo están intentando.",
      "The rule cost them. They have turned down roughly one job for every three they take, including an eleven-unit rental contract in 2021 that would have doubled the business overnight, because taking it would have meant hiring four people they had not personally trained.": "La regla les costó. Han rechazado como un trabajo por cada tres que aceptan, incluido un contrato de once apartamentos en 2021 que les habría duplicado el negocio de la noche a la mañana, porque aceptarlo significaba contratar a cuatro personas que ellas no habían entrenado.",
      "WHAT THEY WILL NOT DO": "LO QUE NO HACEN",
      "Same-day work. Yard work. Anything involving a ladder over eight feet. They will, without charging extra, take the trash out on their way to the van every single visit.": "Trabajo el mismo día. Trabajo de patio. Nada que requiera una escalera de más de ocho pies. Lo que sí hacen, sin cobrar extra: sacar la basura de camino a la van en cada visita.",
      "What they got instead: eighty-one households, most of them within four zip codes, and a client list where the average relationship is over five years. Twelve families have moved to a new house in Miami Lakes and taken the sisters with them.": "Lo que consiguieron en cambio: ochenta y una casas, casi todas en cuatro códigos postales, y una lista de clientes donde la relación promedio pasa de cinco años. Doce familias se mudaron a otra casa en Miami Lakes y se llevaron a las hermanas con ellas.",
      "the two of them loading the van at the end of the day": "las dos cargando la van al final del día",
      "FIG. 2 — Last stop, 4:40pm. Two caddies, two people, eighty-one houses.": "FIG. 2 — Última parada, 4:40pm. Dos cajas, dos personas, ochenta y una casas."
    },

    PHOTOS: {
      'skyline-hero': [[480, './assets/skyline-hero-480.webp'], [828, './assets/skyline-hero-828.webp']],
      hialeah: [[320, './assets/hialeah-320.webp'], [516, './assets/hialeah-516.webp']],
      lakes: [[320, './assets/lakes-320.webp'], [547, './assets/lakes-547.webp']],
      havana: [[640, './assets/havana-640.webp'], [1280, './assets/havana-1280.webp'], [1920, './assets/havana-1920.webp']]
    },

    pickPhoto(base) {
      const set = this.PHOTOS[base];
      if (!set) return null;
      const vw = this.state.vw || 1280;
      const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
      const target = vw * dpr;
      const hit = set.find(s => s[0] >= target * 0.9);
      return (hit || set[set.length - 1])[1];
    },

    CITIES: {
      hialeah: {
        key: 'hialeah', name: 'HIALEAH', sub: 'La Ciudad que Progresa', accent: '#FF2E88', castBg: '#00feff', photoBase: 'hialeah', photoPos: 'center 45%',
        head: { h: '440%', l: '-50%', t: '-11%' },
        blurb: 'Palm Avenue to 49th Street: bakeries that open at 5am, body shops that know your car, and a supper club scene that dresses up for it. The flamingos run this town.',
        solo: 'mascots/flamingo-hialeah.png', soloName: 'RAFA', castCount: 2, groupAR: '1122 / 975',
        cast: [
          { src: 'uploads/flako-y-rizza-bust.png', bg: '#00ffff', name: 'RAFA &amp; YOLI', z: 1, group: true }
        ]
      },
      lakes: {
        key: 'lakes', name: 'MIAMI LAKES', sub: 'Growing Beautifully', accent: '#16E0F2', castBg: '#00feff', photoBase: 'lakes',
        head: { h: '440%', l: '-31%', t: '-14%' },
        blurb: 'Main Street patios, roundabouts, and a town center built for walking. Family businesses that have handled three generations of the same houses. The cows keep it steady.',
        solo: 'mascots/cow-miami-lakes.png', soloName: 'TONI', castCount: 4, groupAR: '2528 / 1696',
        cast: [
          { src: 'uploads/scene-los-mucho-close.png', bg: '#03e3fd', name: 'TONI, MARISOL, MILA &amp; CHUCHO', z: 1, group: true }
        ]
      },
      havana: {
        key: 'havana', name: 'LITTLE HAVANA', sub: 'Calle Ocho Forever', accent: '#FFD400', castBg: '#00fcff', lead: 1, photoBase: 'havana', photoPos: 'center 42%',
        head: { h: '450%', l: '-36%', t: '-16%' },
        blurb: 'Domino Park, ventanitas, live son spilling onto the sidewalk after midnight. Cigar rollers and cantinas that never needed a rebrand. The roosters never sleep.',
        solo: 'mascots/rooster-havana.png', soloName: 'RIGO', castCount: 3, groupAR: '1819 / 978',
        cast: [
          { src: 'uploads/ocho-y-las-gallinas-bust.png', bg: '#00fcff', name: 'BLANCA, RIGO &amp; DAYSI', z: 1, group: true }
        ]
      }
    },

    CATS: [
      { key: 'all', label: 'EVERYTHING' },
      { key: 'food', label: 'BARS & RESTAURANTS' },
      { key: 'night', label: 'NIGHT CLUBS' },
      { key: 'contract', label: 'CONTRACTORS' },
      { key: 'clean', label: 'HOME CLEANING' },
      { key: 'halls', label: 'BANQUET HALLS' }
    ],

    BIZ: [
      { id: 'flamingo-room', name: 'The Flamingo Room Supper Club', city: 'hialeah', cat: 'food', hood: 'Palm Ave', rating: 4.8, reviews: 214, price: '$$$', member: true, tag: 'White tablecloths, a house trio, and the best palomilla north of the Miami River.', hint: 'Dining room at night' },
      { id: 'pan-cubano', name: 'Panadería El Progreso', city: 'hialeah', cat: 'food', hood: 'E 4th Ave', rating: 4.9, reviews: 508, price: '$', member: true, tag: 'Croquetas out of the fryer at 6am and pan cubano still warm at noon.', hint: 'Bakery counter' },
      { id: 'rivera-roof', name: 'Rivera Roofing & Repairs', city: 'hialeah', cat: 'contract', hood: 'W 12th St', rating: 4.7, reviews: 132, price: '$$', member: false, tag: 'Third-generation roofers. Permits pulled, tile matched, no ghosting after the deposit.', hint: 'Crew on a roof' },
      { id: 'salon-tropical', name: 'Salón Tropical Banquet Hall', city: 'hialeah', cat: 'halls', hood: 'Okeechobee Rd', rating: 4.6, reviews: 96, price: '$$$', member: true, tag: '400 seats, a real dance floor, and a quinceañera package your tía will approve.', hint: 'Hall set for a party' },
      { id: 'club-neon', name: 'Neón 305', city: 'hialeah', cat: 'night', hood: 'Hialeah Dr', rating: 4.4, reviews: 187, price: '$$', member: false, tag: 'Reggaetón downstairs, timba upstairs, croquetas at 3am from the window out back.', hint: 'Club dance floor' },
      { id: 'chophouse', name: 'Main Street Chophouse', city: 'lakes', cat: 'food', hood: 'Town Center', rating: 4.7, reviews: 341, price: '$$$', member: true, tag: 'Dry-aged steaks, a patio under the oaks, and a kids menu that is not an afterthought.', hint: 'Patio dinner table' },
      { id: 'sparkle', name: 'Lakes Sparkle Home Cleaning', city: 'lakes', cat: 'clean', hood: 'Royal Oaks', rating: 4.9, reviews: 276, price: '$$', member: true, tag: 'Same two-person team every visit. Deep clean, move-outs, and post-party rescues.', hint: 'Spotless kitchen' },
      { id: 'cool-air', name: 'Miami Lakes Cooling & Air', city: 'lakes', cat: 'contract', hood: 'NW 67th Ave', rating: 4.8, reviews: 203, price: '$$', member: false, tag: 'Same-day A/C repair in August, which is the only month that counts.', hint: 'Technician at work' },
      { id: 'oak-hall', name: 'The Oaks Banquet & Events', city: 'lakes', cat: 'halls', hood: 'Main St', rating: 4.5, reviews: 74, price: '$$$', member: false, tag: 'Weddings, sweet sixteens and Sunday church luncheons under one very tall ceiling.', hint: 'Wedding reception' },
      { id: 'el-gallo', name: 'El Gallo Cantina', city: 'havana', cat: 'food', hood: 'SW 8th St', rating: 4.9, reviews: 612, price: '$$', member: true, tag: 'Ropa vieja, a nine-piece band on Thursdays, and mojitos poured with too much rum.', hint: 'Cantina bar' },
      { id: 'cigar-lounge', name: 'La Corona Cigar Lounge', city: 'havana', cat: 'night', hood: 'Calle Ocho', rating: 4.7, reviews: 158, price: '$$', member: true, tag: 'Rollers up front, rum in the back, dominoes going until the last table gives up.', hint: 'Cigar lounge' },
      { id: 'domino-cafe', name: 'Ventanita Domino Café', city: 'havana', cat: 'food', hood: 'Máximo Gómez Park', rating: 4.8, reviews: 429, price: '$', member: false, tag: 'A colada, a pastelito, and the loudest political debate on the block. Free with purchase.', hint: 'Ventanita window' },
      { id: 'havana-hall', name: 'Salón Habana Events', city: 'havana', cat: 'halls', hood: 'SW 12th Ave', rating: 4.4, reviews: 61, price: '$$', member: false, tag: 'Old tile floors, string lights, and a stage that has held every kind of band.', hint: 'Event hall stage' },
      { id: 'ocho-clean', name: 'Ocho Clean Crew', city: 'havana', cat: 'clean', hood: 'SW 17th Ave', rating: 4.6, reviews: 118, price: '$', member: true, tag: 'Apartment turnovers, post-renovation dust, and windows that finally see the street.', hint: 'Cleaning crew' }
    ],

    SPOTS: {
      hialeah: { biz: 'flamingo-room', kind: 'SUPPER CLUB · DATE NIGHT', deal: '2-for-1 mojitos, Thursday to Saturday, 7–9pm', blurb: 'Rafa books the corner booth and Yoli makes him wear the good guayabera. Live trio starts at nine.' },
      lakes: { biz: 'chophouse', kind: 'STEAKHOUSE · FAMILY TABLE', deal: 'Sunday family platter for four — $68', blurb: 'The whole herd shows up after church. Kids eat on the patio, Toni argues about the check.' },
      havana: { biz: 'el-gallo', kind: 'CANTINA · LIVE MUSIC', deal: 'Live son cubano Thursdays, no cover before 10pm', blurb: 'Rigo brings Blanca and Daysi, orders three ropa viejas, and nobody leaves before last call.' }
    },

    DETAIL: {
      'el-gallo': {
        story: [
          'Rigoberto Peña opened El Gallo in 1994 with eight tables, a rice cooker and a hand-painted sign his brother made in one afternoon. The sign is still over the door. It has been repainted four times.',
          'The kitchen has never had a written menu longer than one page. Ropa vieja on Monday, oxtail on Wednesday, and whatever the fish guy brought in on Friday. Regulars stopped asking and just say "lo de siempre."',
          'On Thursdays the tables get pushed to the wall for the band. It is nine pieces, it is loud, and the neighbors gave up complaining in about 2003.'
        ],
        quote: 'You do not come here for the decoration. You come because your grandmother would approve of the black beans.',
        quoteBy: 'RIGO PEÑA, OWNER',
        menuNote: 'KITCHEN OPEN UNTIL 1AM',
        menu: [
          { name: 'Ropa Vieja', desc: 'Shredded brisket, peppers, white rice, sweet plantains', price: '$21' },
          { name: 'Lechón Asado', desc: 'Slow-roasted pork shoulder, mojo, yuca con mojo', price: '$23' },
          { name: 'Croquetas de Jamón (6)', desc: 'Fried to order. Do not ask for the recipe.', price: '$9' },
          { name: 'Pollo a la Plancha', desc: 'Marinated overnight, black beans, moros', price: '$18' },
          { name: 'Mojito de la Casa', desc: 'Too much rum. Intentionally.', price: '$12' },
          { name: 'Flan de la Abuela', desc: 'One size. One answer.', price: '$8' }
        ],
        address: '1412 SW 8th St, Miami, FL 33135',
        phone: '(305) 555-0144',
        site: 'elgallocantina.com',
        hours: [{ d: 'Mon – Wed', t: '11am – 11pm' }, { d: 'Thu (Live band)', t: '11am – 2am' }, { d: 'Fri – Sat', t: '11am – 3am' }, { d: 'Sunday', t: '12pm – 10pm' }],
        cta: 'CALL FOR A TABLE',
        crewLine: 'Rigo, Blanca and Daysi hold the front table on Thursdays. Say hello, do not sit in it.'
      }
    },

    STORIES: [
      {
        id: 'el-gallo', biz: 'el-gallo', kicker: 'LITTLE HAVANA · SINCE 1994', readTime: '6 MIN READ',
        title: 'THE SIGN HIS BROTHER PAINTED',
        dek: 'Rigo Peña opened a cantina with eight tables and a secondhand rice cooker. Thirty-two years later, the one thing he refuses to replace is a piece of plywood.',
        byline: 'AS TOLD TO FLAMINGO COUNTY',
        coverHint: 'Drop the cover shot — El Gallo storefront at dusk, sign lit',
        coverCap: 'FIG. 1 — 1412 SW 8th St. The rooster has faced this sidewalk since October 1994.',
        outro: 'Thursdays the tables go against the wall and the nine-piece starts around nine. Kitchen runs to 1am, later on weekends. Front table is Rigo\u2019s — say hello, do not sit in it.',
        bizCta: 'SEE THE LISTING →',
        blocks: [
          ['drop', 'The first thing Rigoberto Peña bought for El Gallo was not a stove. It was a rice cooker, secondhand, from a place on Flagler that had closed for good the week before. He paid eleven dollars for it and carried it home on the bus with the lid taped down.'],
          ['p', 'The second thing was plywood. His brother Néstor painted the sign on the sidewalk out front in one afternoon — a rooster mid-crow, one eye open, in a red nobody has been able to match since. Rigo told him it was temporary. Néstor said fine.'],
          ['img', 'the hand-painted sign over the door, close up', 'FIG. 2 — Repainted four times. Never redrawn. Rigo traces the same lines with a two-inch brush.', '16 / 9'],
          ['q', 'Every few years the sun eats it and I go up the ladder. Same lines. I am not an artist. I am a tracer.', 'RIGO PEÑA, OWNER'],
          ['beat'],
          ['p', 'The kitchen has never had a written menu longer than one page. Monday is ropa vieja. Wednesday is oxtail. Friday is whatever the fish guy brought in that morning, and if you ask what that is, the answer is a shrug and a good price. Regulars stopped asking around 1999. Now they just say lo de siempre and sit down.'],
          ['pair', ['ropa vieja plated, overhead', 'Monday. Nine hours in the pot, no exceptions.'], ['the kitchen pass at 8pm, tickets up', 'Eight tickets deep and nobody is shouting. That took twenty years.']],
          ['note', 'THE ONE-PAGE RULE', 'Rigo has turned down four different consultants who wanted to expand the menu. His argument every time: a long menu means a freezer, and a freezer means Tuesday tastes like Monday.'],
          ['p', 'On Thursdays the tables get pushed against the wall for the band. It is nine pieces. It is loud in a way that the room was not designed for, and that is the point — the trumpet player stands where table six used to be, and the whole place turns into one long conversation about who is dancing badly.'],
          ['img', 'the nine-piece band, Thursday night, room packed', 'FIG. 3 — The neighbors filed complaints until about 2003. Two of them now hold a standing reservation.', '16 / 9'],
          ['p', 'Daysi, his daughter, runs the books now and has for six years. She modernized almost everything: card reader, payroll, a delivery app Rigo pretends not to understand. When she brought up a new sign — clean type, backlit, the kind Calle Ocho is filling up with — he did not argue with her. He just went out to the storage room and showed her the four cans of red he keeps for it.'],
          ['q', 'She can change anything she wants. When I am gone she will still know which red.', 'RIGO PEÑA']
        ]
      },
      {
        id: 'pan-cubano', biz: 'pan-cubano', kicker: 'HIALEAH · SINCE 1981', readTime: '5 MIN READ',
        title: 'THE 4:40 SHIFT',
        dek: 'At Panadería El Progreso the day starts in the dark, and it has started that way for forty-five years — first with Odalys, now with her son and a very serious thermometer.',
        byline: 'AS TOLD TO FLAMINGO COUNTY',
        coverHint: 'Drop the cover shot — bakery counter before opening, warm light',
        coverCap: 'FIG. 1 — E 4th Ave, 4:52am. The first tray of pan cubano comes out in eight minutes.',
        outro: 'Croquetas start hitting the fryer at six. Pan cubano is still warm at noon, gone by two on Saturdays. Cash and card, but the abuelas still bring exact change.',
        bizCta: 'SEE THE LISTING →',
        blocks: [
          ['drop', 'Odalys Ferrer opened the bakery in 1981 in a unit that had been a laundromat, which is why there is a floor drain in the middle of the sales floor that no one has ever bothered to explain to a health inspector.'],
          ['p', 'She worked the 4:40 shift alone for eleven years. Her son Ernesto started coming with her when he was nine because there was nobody to leave him with, and he did his homework on flour sacks near the oven where it was warm.'],
          ['img', 'the old deck oven, door open, trays going in', 'FIG. 2 — The deck oven is original. It has been rebuilt twice and moved once, four feet to the left, in 1996.', '16 / 9'],
          ['q', 'My mother did not teach me a recipe. She taught me what the dough is supposed to feel like at ten to five.', 'ERNESTO FERRER'],
          ['beat'],
          ['p', 'Ernesto runs it now and he is, by his own admission, the difficult one. He bought a digital probe thermometer in 2014 and started writing hydration percentages on a whiteboard in the back. His mother, who still comes in on Saturdays, calls the whiteboard el altar.'],
          ['pair', ['croquetas coming out of the fryer', 'Ham croquetas. Six for nine dollars, unchanged for three years.'], ['the morning line out the door', '6:15am. Nurses coming off overnight, roofers going on.']],
          ['note', 'WHAT SELLS OUT FIRST', 'Pastelitos de guayaba by 7:30. Croquetas by 9 on a weekday. The Saturday cake case is picked clean by noon, mostly by people who ordered ahead and still show up early to make sure.'],
          ['p', 'The line outside at 6am is the same line as 1985, one generation over: night-shift nurses on the way home, framers on the way out, and two men who have been arguing about the same baseball season since before the bakery had a phone number.'],
          ['img', 'loaves of pan cubano cooling on the rack', 'FIG. 3 — Still warm at noon. That is the entire marketing strategy.', '16 / 9'],
          ['p', 'Odalys, who is seventy-nine, does not work the ovens anymore. She sits at the second table by the window on Saturdays and watches the register, and if the line gets long she gets up and starts bagging without being asked, which drives her son crazy, and which he has stopped mentioning.']
        ]
      },
      {
        id: 'sparkle', biz: 'sparkle', kicker: 'MIAMI LAKES · SINCE 2016', readTime: '4 MIN READ',
        title: 'THE SAME TWO PEOPLE, EVERY TIME',
        dek: 'Two sisters built a cleaning company on one rule that costs them money and keeps every client they have ever had.',
        byline: 'AS TOLD TO FLAMINGO COUNTY',
        coverHint: 'Drop the cover shot — the two-person team in a client kitchen, van keys on counter',
        coverCap: 'FIG. 1 — Royal Oaks, Tuesday. Dania takes the kitchen, Yaneisy takes the bathrooms. Always.',
        outro: 'Deep cleans, biweekly service, move-outs, and post-party rescues. They book four weeks out and will tell you honestly if a job is too big for two people.',
        bizCta: 'SEE THE LISTING →',
        blocks: [
          ['drop', 'Dania Sardiñas cleaned houses for a national franchise for six years. The crew she was assigned to changed almost every week, and so every Monday she was explaining to a stranger which cabinet the dog food lived in.'],
          ['p', 'She quit in 2016, called her sister Yaneisy, and they wrote down one rule before they took a single job: the same two people go to the same houses, forever. No rotating crews. No subcontractors. If they are booked, they say booked.'],
          ['q', 'Anybody can clean a kitchen. Knowing that the mother-in-law is coming Friday, that is the job.', 'DANIA SARDIÑAS'],
          ['pair', ['supply caddy, labeled, in the van', 'Everything fits in two caddies. On purpose — a bigger van means a bigger crew.'], ['a finished kitchen, late afternoon light', 'Three hours, two people. They have not been faster since 2019 and are not trying to be.']],
          ['beat'],
          ['p', 'The rule cost them. They have turned down roughly one job for every three they take, including an eleven-unit rental contract in 2021 that would have doubled the business overnight, because taking it would have meant hiring four people they had not personally trained.'],
          ['note', 'WHAT THEY WILL NOT DO', 'Same-day work. Yard work. Anything involving a ladder over eight feet. They will, without charging extra, take the trash out on their way to the van every single visit.'],
          ['p', 'What they got instead: eighty-one households, most of them within four zip codes, and a client list where the average relationship is over five years. Twelve families have moved to a new house in Miami Lakes and taken the sisters with them.'],
          ['img', 'the two of them loading the van at the end of the day', 'FIG. 2 — Last stop, 4:40pm. Two caddies, two people, eighty-one houses.', '16 / 9'],
          ['p', 'They still clean every house themselves. When people ask when they are going to grow, Yaneisy says they already did — sideways, into people\u2019s lives — and then she asks whether the guest bathroom needs doing this week or the week after.']
        ]
      }
    ],

    storyBlocks(sid, blocks) {
      return blocks.map((b, i) => {
        const t = b[0], o = { isDrop: t === 'drop', isPara: t === 'p', isQuote: t === 'q', isImg: t === 'img', isPair: t === 'pair', isNote: t === 'note', isBeat: t === 'beat' };
        if (t === 'drop') { o.cap = b[1].slice(0, 1); o.text = b[1].slice(1); }
        if (t === 'p') o.text = b[1];
        if (t === 'q') { o.text = b[1]; o.by = b[2]; }
        if (t === 'img') { o.slot = 'st-' + sid + '-' + i; o.hint = this.T('Drop: ') + b[1]; o.cap2 = b[2]; o.ar = b[3] || '16 / 9'; }
        if (t === 'pair') {
          o.a = { slot: 'st-' + sid + '-' + i + 'a', hint: this.T('Drop: ') + b[1][0], cap: b[1][1] };
          o.b = { slot: 'st-' + sid + '-' + i + 'b', hint: this.T('Drop: ') + b[2][0], cap: b[2][1] };
        }
        if (t === 'note') { o.title = b[1]; o.text = b[2]; }
        return o;
      });
    },

    storyCard(s) {
      s = this.tx(s);
      const b = this.biz(s.biz), c = this.city(b.city);
      return {
        id: s.id, title: s.title, kicker: s.kicker, dek: s.dek, readTime: s.readTime,
        cityName: c.name, coverSlot: 'story-cover-' + s.id, coverHint: s.coverHint,
        href: this.href('Story', { s: s.id })
      };
    },

    biz(id) { return this.tx(this.BIZ.find(b => b.id === id)); },

    sized(cast, base, overlap) {
      return cast.map(m => {
        const small = m.scale && m.scale < 1;
        const gap = Math.round(base * 0.025) + 'px';
        const tuck = Math.round(base * -0.11) + 'px';
        if (m.group) return { ...m, flip: 'none', as: 'flex-end', h: '75%', w: '100%', mh: 'none', of: 'contain', mx: '0 0' };
        return { ...m, as: 'flex-end', w: 'auto', mh: 'none', of: 'fill', flip: m.flip ? 'scaleX(-1)' : 'none', h: Math.round(base * (m.scale || 1)) + 'px',
          mx: small ? (m.pull === 'right' ? '0 ' + tuck + ' 0 ' + gap : '0 ' + gap + ' 0 ' + tuck)
            : m.noOverlap ? '0 0'
            : m.tuckRight ? '0 ' + Math.round(base * -m.tuckRight) + 'px 0 ' + overlap : '0 ' + overlap };
      });
    },

    card(b) {
      b = this.tx(b);
      const c = this.city(b.city);
      const cat = this.CATS.find(x => x.key === b.cat);
      return {
        id: b.id, name: b.name, tag: b.tag, hood: b.hood, price: b.price, rating: b.rating.toFixed(1),
        catLabel: cat ? this.T(cat.label) : '', cityName: c.name, accent: c.accent, mascot: c.solo || c.cast[c.lead || 0].src,
        headH: c.head.h, headL: c.head.l, headT: c.head.t,
        slot: 'card-' + b.id, citySlot: 'city-' + b.id, slotHint: this.T('Drop: ') + b.hint,
        showMember: b.member && (this.props.memberBadges !== false),
        showRating: this.props.showRatings !== false,
        href: this.href('Business', { city: b.city, biz: b.id })
      };
    },

    EV_TODAY: '2026-08-17',
    WD: { en: ['SUN','MON','TUE','WED','THU','FRI','SAT'], es: ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'] },
    MO: { en: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'], es: ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'] },
    MONTHNAME: { 8: { en: 'AUGUST 2026', es: 'AGOSTO 2026' }, 9: { en: 'SEPTEMBER 2026', es: 'SEPTIEMBRE 2026' } },

    EKINDS: [
      { key: 'all', label: 'ALL EVENTS', bg: 'linear-gradient(160deg,#FF63AC 0%,#FF2E88 52%,#DE1468 100%)', ink: '#FFF6E5' },
      { key: 'music', label: 'LIVE MUSIC', bg: 'linear-gradient(160deg,#FF63AC 0%,#FF2E88 52%,#DE1468 100%)', ink: '#FFF6E5' },
      { key: 'domino', label: 'DOMINOES & CARDS', bg: 'linear-gradient(160deg,#7CF0FA 0%,#16E0F2 52%,#04AEBE 100%)', ink: '#0C0F14' },
      { key: 'food', label: 'FOOD & DRINK', bg: '#FFD400', ink: '#0C0F14' },
      { key: 'family', label: 'FAMILY DAYS', bg: 'linear-gradient(160deg,#7CF0FA 0%,#16E0F2 52%,#04AEBE 100%)', ink: '#0C0F14' },
      { key: 'sports', label: 'WATCH PARTIES', bg: '#0C0F14', ink: '#16E0F2' },
      { key: 'church', label: 'COMMUNITY', bg: 'linear-gradient(160deg,#FFFFFA 0%,#FFF6E5 55%,#F4E3C6 100%)', ink: '#0C0F14' },
      { key: 'opening', label: 'GRAND OPENINGS', bg: 'linear-gradient(160deg,#FF63AC 0%,#FF2E88 52%,#DE1468 100%)', ink: '#FFF6E5' }
    ],
    ekind(k) { return this.EKINDS.find(x => x.key === k) || this.EKINDS[1]; },

    EVENTS: [
      { id: 'son-thursday', d: '2026-08-20', time: '9PM–1AM', title: 'Son Cubano Thursdays: Los Nueve', biz: 'el-gallo', kind: 'music', going: 128, free: 'NO COVER BEFORE 10', star: true, note: 'Nine pieces, two trumpets, and Rigo at the front table by 8:45. The floor fills by the third song.', hint: 'Band on the cantina floor' },
      { id: 'rollers-table', d: '2026-08-20', time: '7PM', title: "Rollers' Table: Dominoes & Rum Flight", biz: 'cigar-lounge', kind: 'domino', going: 34 },
      { id: 'progreso-window', d: '2026-08-21', time: '6AM–NOON', title: 'Second Window Grand Opening', biz: 'pan-cubano', kind: 'opening', going: 96, free: 'FREE CAFECITO ALL MORNING', star: true, note: 'Forty years on one window, now there are two. Free colada until the pot runs out, which is usually 9:30.', hint: 'Bakery window at dawn' },
      { id: 'timba-upstairs', d: '2026-08-21', time: '11PM', title: 'Timba Upstairs with DJ Cachito', biz: 'club-neon', kind: 'music', going: 212 },
      { id: 'fish-fry', d: '2026-08-21', time: '6PM', title: 'Friday Fish Fry for the Parish', biz: 'oak-hall', kind: 'church', going: 58, free: '$12 A PLATE' },
      { id: 'domino-open', d: '2026-08-22', time: '10AM–6PM', title: 'The Calle Ocho Domino Open', place: 'Máximo Gómez Park', hood: 'SW 8th St', city: 'havana', kind: 'domino', going: 214, free: 'FREE TO WATCH', star: true, note: 'Sixty-four tables, one trophy, and a bracket taped to the fence. Bring a hat and somebody who can count.', hint: 'Domino tables under the awning' },
      { id: 'patio-session', d: '2026-08-22', time: '7:30PM', title: 'Patio Session: Trio Under the Oaks', biz: 'chophouse', kind: 'music', going: 71 },
      { id: 'splash-day', d: '2026-08-22', time: '10AM–2PM', title: 'Splash Pad Family Day', place: 'Miami Lakes Optimist Park', hood: 'Main St', city: 'lakes', kind: 'family', going: 145, free: 'FREE · CITY EVENT' },
      { id: 'fellowship', d: '2026-08-23', time: '1PM', title: 'Sunday Fellowship Luncheon', biz: 'havana-hall', kind: 'church', going: 88, free: 'FREE' },
      { id: 'inter-watch', d: '2026-08-23', time: '6PM', title: 'Inter Miami Watch Party', biz: 'club-neon', kind: 'sports', going: 163 },
      { id: 'senior-social', d: '2026-08-25', time: '10AM', title: 'Senior Social & Cafecito Hour', place: 'Hialeah Senior Center', hood: 'E 4th Ave', city: 'hialeah', kind: 'church', going: 42, free: 'FREE' },
      { id: 'salsa-class', d: '2026-08-26', time: '8PM', title: 'Free Salsa Class Before Quince Season', biz: 'salon-tropical', kind: 'family', going: 67, free: 'FREE LESSON' },
      { id: 'roll-taste', d: '2026-08-27', time: '8PM', title: 'Roll & Taste: Corona Reserve', biz: 'cigar-lounge', kind: 'food', going: 39 },
      { id: 'house-trio', d: '2026-08-28', time: '9PM', title: 'House Trio & 2-for-1 Mojitos', biz: 'flamingo-room', kind: 'music', going: 104 },
      { id: 'supply-drive', d: '2026-08-29', time: '9AM–1PM', title: 'Back-to-School Supply Drive', biz: 'ocho-clean', kind: 'church', going: 76, free: 'FREE · DROP OFF ANY TIME' },
      { id: 'kids-chef', d: '2026-08-29', time: '11AM', title: "Kids' Chef Table", biz: 'chophouse', kind: 'family', going: 52 },
      { id: 'dolphins-kickoff', d: '2026-08-30', time: '1PM', title: 'Dolphins Season Kickoff Party', biz: 'chophouse', kind: 'sports', going: 188 },
      { id: 'boleros', d: '2026-09-03', time: '8PM', title: 'Noche de Boleros', biz: 'havana-hall', kind: 'music', going: 59 },
      { id: 'roof-checks', d: '2026-09-05', time: '9AM–1PM', title: 'Open House & Free Roof Checks', biz: 'rivera-roof', kind: 'opening', going: 31, free: 'FREE INSPECTION' },
      { id: 'domino-finals', d: '2026-09-13', time: '11AM', title: 'Domino Open Finals', place: 'Máximo Gómez Park', hood: 'SW 8th St', city: 'havana', kind: 'domino', going: 97, free: 'FREE TO WATCH' }
    ],

    WEEKLY: [
      { dow: 1, time: '8PM', title: 'Fútbol Night on the Big Screen', biz: 'club-neon', kind: 'sports' },
      { dow: 2, time: '7PM', title: 'Domino League Night', biz: 'domino-cafe', kind: 'domino' },
      { dow: 3, time: '5–9PM', title: 'Kids Eat Free', biz: 'chophouse', kind: 'family' },
      { dow: 4, time: '9PM', title: 'Son Cubano Live', biz: 'el-gallo', kind: 'music' },
      { dow: 5, time: '6–8AM', title: '6AM Croqueta Hour, Half Off', biz: 'pan-cubano', kind: 'food' },
      { dow: 0, time: '12:30PM', title: 'Church Luncheon', biz: 'oak-hall', kind: 'church' }
    ],

    EV_ES: {
      "EVENTS": "EVENTOS",
      "ON DECK": "LO QUE VIENE",
      "THE ONE THING NOT TO MISS THIS WEEK": "LO ÚNICO QUE NO TE PUEDES PERDER ESTA SEMANA",
      "SEE THE EVENT →": "VER EL EVENTO →",
      "WHAT THE CREWS ARE DOING NEXT": "LO QUE VIENE PA' LA PANDILLA",
      "FREE THINGS TO DO THIS WEEKEND": "COSAS GRATIS PA' ESTE FIN DE SEMANA",
      "THIS WEEK IN THE": "ESTA SEMANA EN LAS",
      "THREE CITIES.": "TRES CIUDADES.",
      "Every domino table, live band, watch party and city day worth leaving the house for. Members post theirs — the city ones we hunt down ourselves.": "Cada mesa de dominó, banda en vivo, party pa' ver el juego y día de la ciudad que vale salir de la casa. Los socios ponen los suyos — los de la ciudad los cazamos nosotros.",
      "LIST": "LISTA",
      "CALENDAR": "CALENDARIO",
      "ON THE BOARD": "EN LA PIZARRA",
      "FREE TO GET IN": "GRATIS PA' ENTRAR",
      "HEADLINERS": "LO GRANDE",
      "THE THREE WE WOULD CANCEL PLANS FOR": "LOS TRES POR LOS QUE CANCELAMOS TODO",
      "EVERY WEEK, LIKE CLOCKWORK": "CADA SEMANA, COMO UN RELOJ",
      "THE REGULARS YOU CAN SET A WATCH BY": "LOS FIJOS DE SIEMPRE",
      "WEEKLY": "CADA SEMANA",
      "MY WEEK": "MI SEMANA",
      "SAVED": "GUARDADOS",
      "SHOW EVERYTHING": "VER TODO",
      "NOTHING ON THIS FILTER — TRY ANOTHER CITY OR ANOTHER KIND.": "NADA CON ESE FILTRO — PRUEBA OTRA CIUDAD U OTRO TIPO.",
      "CITY:": "CIUDAD:",
      "KIND:": "TIPO:",
      "ALL THREE": "LAS TRES",
      "ALL EVENTS": "TODOS LOS EVENTOS",
      "+ CALENDAR": "+ CALENDARIO",
      "GOING": "VAN",
      "YOU'RE GOING ·": "TÚ VAS ·",
      "+ MY WEEK": "+ MI SEMANA",
      "IN MY WEEK": "EN MI SEMANA",
      "TAP A DAY TO JUMP STRAIGHT TO IT": "TOCA UN DÍA PA' IR DERECHITO",
      "TODAY": "HOY",
      "THIS WEEKEND": "ESTE FIN DE SEMANA",
      "THU 20 — SUN 23 AUG": "JUE 20 — DOM 23 AGO",
      "NEXT WEEK": "LA SEMANA QUE VIENE",
      "MON 24 — SUN 30 AUG": "LUN 24 — DOM 30 AGO",
      "LATER ON": "MÁS ADELANTE",
      "SEPTEMBER AND BEYOND": "SEPTIEMBRE Y DESPUÉS",
      "GOT SOMETHING HAPPENING?": "¿TIENES ALGO EN CANDELA?",
      "Members post events — bands, tournaments, openings, watch parties. The good ones go in the Friday email and on the front page.": "Los socios publican sus eventos — bandas, torneos, aperturas, parties pa' ver el juego. Los buenos van en el correo del viernes y en la portada.",
      "POST AN EVENT": "PUBLICA UN EVENTO",
      "LIVE MUSIC": "MÚSICA EN VIVO",
      "DOMINOES & CARDS": "DOMINÓ Y CARTAS",
      "FOOD & DRINK": "COMIDA Y BEBIDA",
      "FAMILY DAYS": "DÍAS FAMILIARES",
      "WATCH PARTIES": "VER EL JUEGO",
      "COMMUNITY": "COMUNIDAD",
      "GRAND OPENINGS": "APERTURAS",
      "NO COVER BEFORE 10": "SIN COVER ANTES DE LAS 10",
      "FREE CAFECITO ALL MORNING": "CAFECITO GRATIS TODA LA MAÑANA",
      "$12 A PLATE": "$12 EL PLATO",
      "FREE TO WATCH": "GRATIS PA' MIRAR",
      "FREE · CITY EVENT": "GRATIS · EVENTO DE LA CIUDAD",
      "FREE": "GRATIS",
      "FREE LESSON": "CLASE GRATIS",
      "FREE · DROP OFF ANY TIME": "GRATIS · DEJA LAS COSAS CUANDO QUIERAS",
      "FREE INSPECTION": "INSPECCIÓN GRATIS",
      "Máximo Gómez Park": "Parque Máximo Gómez",
      "Miami Lakes Optimist Park": "Parque Optimist de Miami Lakes",
      "Hialeah Senior Center": "Centro de Mayores de Hialeah",
      "Son Cubano Thursdays: Los Nueve": "Jueves de Son Cubano: Los Nueve",
      "Rollers' Table: Dominoes & Rum Flight": "La Mesa de los Torcedores: Dominó y Ron",
      "Second Window Grand Opening": "Apertura de la Segunda Ventanita",
      "Timba Upstairs with DJ Cachito": "Timba Arriba con DJ Cachito",
      "Friday Fish Fry for the Parish": "Viernes de Pescado Frito pa' la Parroquia",
      "The Calle Ocho Domino Open": "El Abierto de Dominó de la Calle Ocho",
      "Patio Session: Trio Under the Oaks": "Sesión de Patio: Trío Bajo los Robles",
      "Splash Pad Family Day": "Día Familiar en el Splash Pad",
      "Sunday Fellowship Luncheon": "Almuerzo de Hermandad del Domingo",
      "Inter Miami Watch Party": "Party pa' Ver al Inter Miami",
      "Senior Social & Cafecito Hour": "Social de Mayores y Hora del Cafecito",
      "Free Salsa Class Before Quince Season": "Clase de Salsa Gratis Antes de los Quince",
      "Roll & Taste: Corona Reserve": "Torcido y Cata: Corona Reserve",
      "House Trio & 2-for-1 Mojitos": "Trío de la Casa y Mojitos 2x1",
      "Back-to-School Supply Drive": "Recogida de Útiles pa' la Escuela",
      "Kids' Chef Table": "Mesa de Chef pa' los Niños",
      "Dolphins Season Kickoff Party": "Party de Arranque de los Dolphins",
      "Open House & Free Roof Checks": "Casa Abierta y Revisión de Techo Gratis",
      "Domino Open Finals": "Final del Abierto de Dominó",
      "Nine pieces, two trumpets, and Rigo at the front table by 8:45. The floor fills by the third song.": "Nueve músicos, dos trompetas y Rigo en la mesa de adelante a las 8:45. Pa' la tercera canción no cabe nadie.",
      "Forty years on one window, now there are two. Free colada until the pot runs out, which is usually 9:30.": "Cuarenta años con una ventanita, ahora hay dos. Colada gratis hasta que se acabe, que suele ser a las 9:30.",
      "Sixty-four tables, one trophy, and a bracket taped to the fence. Bring a hat and somebody who can count.": "Sesenta y cuatro mesas, un trofeo y el cuadro pegado a la cerca. Trae gorra y alguien que sepa contar.",
      "Band on the cantina floor": "La banda en la cantina",
      "Bakery window at dawn": "La ventanita al amanecer",
      "Domino tables under the awning": "Las mesas de dominó bajo el toldo",
      "Fútbol Night on the Big Screen": "Noche de Fútbol en la Pantalla Grande",
      "Domino League Night": "Noche de Liga de Dominó",
      "Kids Eat Free": "Los Niños Comen Gratis",
      "Son Cubano Live": "Son Cubano en Vivo",
      "6AM Croqueta Hour, Half Off": "Hora de la Croqueta a las 6AM, Mitad de Precio",
      "Church Luncheon": "Almuerzo de la Iglesia"
    },

    evCityOf(e) { return e.biz ? this.BIZ.find(b => b.id === e.biz).city : e.city; },
    evDate(d) { return new Date(d + 'T12:00:00'); },
    ics(e, title, venue) {
      const dt = e.d.replace(/-/g, '');
      const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flamingo County//Events//EN', 'BEGIN:VEVENT',
        'UID:' + e.id + '@flamingocounty.com', 'DTSTART;VALUE=DATE:' + dt, 'DTEND;VALUE=DATE:' + dt,
        'SUMMARY:' + title, 'LOCATION:' + venue, 'DESCRIPTION:' + e.time + ' · Flamingo County', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(body);
    },
    evCard(e) {
      const L = this.lang() === 'es' ? 'es' : 'en';
      const k = this.ekind(e.kind), c = this.city(this.evCityOf(e));
      const b = e.biz ? this.biz(e.biz) : null;
      const dt = this.evDate(e.d);
      const isGoing = !!this.going()[e.id], isSaved = !!this.saved()[e.id];
      const total = e.going + (isGoing ? 1 : 0);
      const title = this.T(e.title), venue = b ? b.name : this.T(e.place);
      return {
        id: e.id, anchor: 'day-' + e.d, iso: e.d,
        day: String(dt.getDate()), wd: this.WD[L][dt.getDay()], mon: this.MO[L][dt.getMonth()],
        time: e.time, title: title, note: this.T(e.note || ''),
        venue: venue, hood: b ? b.hood : e.hood, cityName: c.name, cityKey: this.evCityOf(e), mascot: c.solo, castBg: c.castBg,
        kindLabel: this.T(k.label), bg: k.bg, ink: k.ink,
        free: this.T(e.free || ''), hasFree: !!e.free, hasBiz: !!b, going: total,
        goLabel: isGoing ? this.T("YOU'RE GOING ·") + ' ' + total : total + ' ' + this.T('GOING'),
        goBg: isGoing ? '#0C0F14' : 'linear-gradient(160deg,#FFFFFA 0%,#FFF6E5 55%,#F4E3C6 100%)', goInk: isGoing ? '#16E0F2' : '#0C0F14',
        saveLabel: isSaved ? this.T('IN MY WEEK') : this.T('+ MY WEEK'),
        saveBg: isSaved ? '#FFD400' : 'linear-gradient(160deg,#FFFFFA 0%,#FFF6E5 55%,#F4E3C6 100%)',
        toggleGoing: () => this.toggleFlag('going', e.id),
        toggleSave: () => this.toggleFlag('saved', e.id),
        ics: this.ics(e, title, venue), icsFile: e.id + '.ics',
        slot: 'ev-' + e.id, hint: this.T(e.hint || 'Photo from the night'),
        href: this.href('Event', { e: e.id }),
        bizHref: b ? this.href('Business', { city: b.city, biz: b.id }) : null,
        bizName: b ? b.name : null
      };
    },
    evFilter(cityKey, kindKey, savedOnly) {
      const saved = this.saved();
      return this.EVENTS.filter(e =>
        (!cityKey || cityKey === 'all' || this.evCityOf(e) === cityKey) &&
        (!kindKey || kindKey === 'all' || e.kind === kindKey) &&
        (!savedOnly || saved[e.id]));
    },
    perkIcon(i) {
      const names = ['map-pin', 'nfc', 'qr-code', 'newspaper', 'megaphone', 'bird'];
      return { icon: 'assets/icons/' + names[i % names.length] + '.svg' };
    },
    tAll() {
    const T = s => this.T(s);
    return {
      navStories: T('STORIES'), navList: T('LIST YOUR SPOT'), navListBiz: T('LIST YOUR BUSINESS'), navListings: T('LISTINGS'),
      heroKicker: T('EVERY BUSINESS. THREE CITIES. ONE LISTING.'), heroH1a: T('EAT, HIRE & CELEBRATE'), heroH1b: T('WITH THE LOCALS.'),
      heroP: T('Bars, restaurants, contractors, home cleaning and banquet halls — vouched for by the neighborhoods that use them. Pick a city up top to meet its crew.'),
      searchPh: T('Search a business, dish or trade…'), reset: T('RESET'),
      nlKicker: T('NEWSLETTER'), nlH: T('DEALS IN YOUR INBOX EVERY FRIDAY'),
      nlP: T('One email a week: the spotlight deals, the new listings and where the crews are eating. No spam, ever.'),
      nlPh: T('you@email.com'), nlBtn: T('SIGN ME UP'), nlThanks: T("YOU'RE IN — SEE YOU FRIDAY."),
      nlFine: T('FRIDAYS ONLY · ENGLISH OR SPANISH · UNSUBSCRIBE ANYTIME'),
      spotlight: T('SPOTLIGHT'), spotSub: T('WHERE THE CREWS ARE GOING OUT THIS WEEK'), thisWeek: T('THIS WEEK'), seeSpot: T('SEE THE SPOT →'),
      filter: T('FILTER:'), member: T('MEMBER'), details: T('DETAILS →'), emptyMsg: T('NOTHING HERE YET — TRY ANOTHER FILTER.'),
      ownSpot: T('OWN A SPOT IN ONE OF THE THREE?'),
      joinBandP1: T('Get your listing, your story page and a shot at the weekly spotlight.'),
      cityPage: T('CITY PAGE'), browse: T('BROWSE'), listingsWord: T('LISTINGS'), topOfCity: T('TOP OF THE CITY'),
      allListings: T('← ALL LISTINGS'), heroSlotHint: T('Drop the hero shot — dining room, bar, storefront'), reviews: T('REVIEWS'),
      verifiedMember: T('VERIFIED MEMBER'), theStory: T('THE STORY'), readFull: T('READ THE FULL STORY →'),
      whatTheyDo: T('WHAT THEY DO'), visit: T('VISIT'), withCrew: T('GOING WITH THE CREW?'), alsoIn: T('ALSO IN'),
      membership: T('MEMBERSHIP'), joinH1: T('GET FOUND BY YOUR OWN NEIGHBORHOOD.'),
      joinP: T('Your listing on your own city page, a full story page, your service list, and rotation into the Friday spotlight.'),
      betaKicker: T('BETA · AI RECEPTIONIST'), betaH: T("WE'RE LOOKING FOR BETA TESTERS."),
      betaP: T('Our AI receptionist answers your phone in English or Spanish, takes reservations and texts you the details. Tell us in the form below if you want in.'),
      claim: T('CLAIM YOUR LISTING'),
      fBiz: T('BUSINESS NAME'), fOwner: T('OWNER'), fCity: T('CITY'), fCat: T('CATEGORY'), fPhone: T('PHONE OR EMAIL'),
      fStory: T('TELL US THE STORY (WE WRITE THE PAGE FOR YOU)'), phName: T('Your name'), phStory: T('Opened in 1994 by my abuela…'),
      optHavana: T('Little Havana'), catFood: T('Bars & Restaurants'), catNight: T('Night Clubs'), catContract: T('Contractors'),
      catClean: T('Home Cleaning'), catHalls: T('Banquet Halls'),
      crewsWaiting: T('THE CREWS ARE WAITING'), crewsWaitingP: T('Every member gets their city mascot on their card — that is how locals spot who is one of theirs.'),
      storiesKicker: T('TOLD BY THE OWNERS · WRITTEN BY US'), storiesH1a: T('THE STORIES'), storiesH1b: T('BEHIND THE DOORS'),
      storiesP: T('Every listing on Flamingo County is a person who signed a lease and decided to stay. These are the long versions — read them slow, the pictures come to you.'),
      storiesSoFar: T('STORIES SO FAR'), newEvery: T('NEW ONE EVERY OTHER FRIDAY'), featured: T('FEATURED STORY'), readStory: T('READ THE STORY →'),
      alsoShelf: T('ALSO ON THE SHELF'), read: T('READ →'), yourStory: T('YOUR STORY GOES HERE'),
      yourStoryP: T('Tell us how it started and who still shows up at 6am. We sit down with you, we write it, you approve it. Members only — it comes with the listing.'),
      getInterviewed: T('GET INTERVIEWED →'), allStories: T('← ALL STORIES'), scrollNote: T('SCROLL — THE PICTURES COME WITH YOU'),
      goSee: T('GO SEE IT YOURSELF.'), readAnother: T('READ ANOTHER'),
      footerCities: T('Hialeah · Miami Lakes · Little Havana'), footerNote: T('a local listing, run by locals. © 2026')
    };
  },
    navVals(active) {
      const T = s => this.T(s);
      return {
        homeHref: this.href('Home', {}), evHref: this.href('Events', {}), storiesHref: this.href('Stories', {}),
        joinHref: this.href('ListYourSpot', {}), myWeekHref: this.href('MyWeek', {}), aboutHref: this.href('About', {}),
        navT: { listings: T('LISTINGS'), stories: T('STORIES'), list: T('LIST YOUR SPOT'), events: T('EVENTS'), myWeek: T('MY WEEK'), about: this.lang() === 'es' ? 'NOSOTROS' : 'ABOUT' },
        active: active
      };
    },
    nlVals() {
      const T = s => this.T(s), st = this.state;
      return {
        t: {
          nlKicker: T('NEWSLETTER'), nlH: T('DEALS IN YOUR INBOX EVERY FRIDAY'),
          nlP: T('One email a week: the spotlight deals, the new listings and where the crews are eating. No spam, ever.'),
          nlPh: T('you@email.com'), nlBtn: T('SIGN ME UP'), nlThanks: T("YOU'RE IN — SEE YOU FRIDAY."),
          nlFine: T('FRIDAYS ONLY · ENGLISH OR SPANISH · UNSUBSCRIBE ANYTIME'),
          footerCities: T('Hialeah · Miami Lakes · Little Havana'), footerNote: T('a local listing, run by locals. © 2026')
        },
        email: st.email || '', subbed: !!st.subbed, notSubbed: !st.subbed,
        onEmail: e => this.setState({ email: e.target.value }),
        subscribe: () => {
          const email = (this.state.email || '').trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
          this.setState({ subbed: true });
          this.netlifySubmit('newsletter', { email: email, lang: this.lang() });
        }
      };
    },

    // Netlify Forms: the DOM is rendered by the dc-runtime, so Netlify's
    // deploy-time scanner never sees these fields. forms.html carries the
    // static markup it registers; this posts the matching payload.
    netlifySubmit(formName, data) {
      const body = new URLSearchParams(Object.assign({ 'form-name': formName }, data)).toString();
      return fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      }).catch(() => {});
    }
  };
  window.FCBase = B;

  document.documentElement.lang = B.resolveLang();

  // i18next is loaded from here rather than from a <helmet> script tag: helmet
  // injects scripts with createElement + appendChild, which makes them async, so
  // load order relative to this file is not guaranteed. T() reads the dictionaries
  // directly until this lands, so nothing user-visible waits on it.
  //
  // keySeparator/nsSeparator must stay false — 120 of the keys are English strings
  // containing '.' or ':' ("FILTER:"), which i18next would otherwise read as paths.
  // lng is pinned to 'es' because T() returns the key untouched for English.
  const i18nScript = document.createElement('script');
  i18nScript.src = './vendor/i18next.min.js';
  i18nScript.setAttribute('data-fc-i18n', '');   // marker: the guard below keeps this to one tag
  i18nScript.onload = function () {
    window.i18next.init({
      lng: 'es',
      resources: { es: { translation: Object.assign({}, B.EV_ES, B.ES) } },
      fallbackLng: false,
      keySeparator: false,
      nsSeparator: false,
      initImmediate: false
    });
  };
  i18nScript.onerror = function () {
    console.warn('[fc] i18next failed to load — T() staying on the fallback path');
  };
  // This file executes TWICE on every top-level page. <helmet> is not a real element,
  // so the parser runs its <script src> children natively as body content, and then
  // the runtime clones the same tags into <head> and they run again. (Imported
  // components are fetched as text and rewritten to <sc-helmet>, so only the page's
  // own helmet does this.) Everything above is idempotent; this append is not, hence
  // the guard — image-slot.js and no-touch-hover.js guard themselves the same way.
  if (!document.querySelector('script[data-fc-i18n]')) document.head.appendChild(i18nScript);

  try { window.dispatchEvent(new Event('fc-base')); } catch (e) {}
})();
