import { describe, expect, it } from 'vitest'
import {
  eventCategory,
  filterEventsByCategory,
  eventTitle,
  recordingCategory,
  eventCardLines,
  firstEventInChunk,
  matchesTimelineFilter,
  categoryColor,
  categoryBorderColor,
  categoryStrokeColor,
  categoryLabel,
} from './eventCategory'

describe('recordingCategory', () => {
  const recAt = (ms: number) => ({ start: new Date(ms).toISOString() })
  it('continua quando não há evento no chunk', () => {
    expect(recordingCategory(recAt(0), [], 300_000)).toBe('continua')
  })
  it('usa a maior prioridade (pessoa > movimento) dos eventos no chunk', () => {
    const events = [
      { time: new Date(60_000).toISOString(), label: '' },
      { time: new Date(120_000).toISOString(), label: 'pessoa' },
    ]
    expect(recordingCategory(recAt(0), events, 300_000)).toBe('pessoa')
  })
  it('ignora eventos fora do intervalo do chunk', () => {
    const events = [{ time: new Date(400_000).toISOString(), label: 'pessoa' }]
    expect(recordingCategory(recAt(0), events, 300_000)).toBe('continua')
  })
  it('chunk só com transição de estado (kind=state) → estados (verde)', () => {
    const events = [
      { time: new Date(60_000).toISOString(), label: 'aberto', kind: 'state' as const },
    ]
    expect(recordingCategory(recAt(0), events, 300_000)).toBe('estados')
  })
  it('detecção real predomina sobre estado no mesmo chunk', () => {
    const events = [
      { time: new Date(60_000).toISOString(), label: 'aberto', kind: 'state' as const },
      { time: new Date(90_000).toISOString(), label: '' },
    ]
    expect(recordingCategory(recAt(0), events, 300_000)).toBe('movimento')
  })
  it('estado tem prioridade sobre continua mas perde para pessoa/movimento/label específico', () => {
    const stateOnly = [
      { time: new Date(60_000).toISOString(), label: 'fechado', kind: 'state' as const },
    ]
    expect(recordingCategory(recAt(0), stateOnly, 300_000)).toBe('estados')
    const withPerson = [
      { time: new Date(60_000).toISOString(), label: 'fechado', kind: 'state' as const },
      { time: new Date(90_000).toISOString(), label: 'pessoa' },
    ]
    expect(recordingCategory(recAt(0), withPerson, 300_000)).toBe('pessoa')
  })

  describe('CA4: prioridade entre labels específicos, pessoa e movimento no mesmo chunk', () => {
    it('label específico (ex.: "carro") tem prioridade sobre movimento (label vazio) no mesmo chunk', () => {
      const events = [
        { time: new Date(60_000).toISOString(), label: '' },
        { time: new Date(90_000).toISOString(), label: 'carro' },
      ]
      expect(recordingCategory(recAt(0), events, 300_000)).toBe('carro')
    })
    it('pessoa vence QUALQUER label específico no mesmo chunk', () => {
      const events = [
        { time: new Date(60_000).toISOString(), label: 'carro' },
        { time: new Date(90_000).toISOString(), label: 'pessoa' },
      ]
      expect(recordingCategory(recAt(0), events, 300_000)).toBe('pessoa')
    })
    it('entre labels específicos distintos, o com MAIS ocorrências no chunk vence', () => {
      const events = [
        { time: new Date(10_000).toISOString(), label: 'carro' },
        { time: new Date(20_000).toISOString(), label: 'gato' },
        { time: new Date(30_000).toISOString(), label: 'gato' },
      ]
      expect(recordingCategory(recAt(0), events, 300_000)).toBe('gato')
    })
    it('empate na contagem entre labels específicos desempata em ordem ALFABÉTICA (determinístico)', () => {
      const events = [
        { time: new Date(10_000).toISOString(), label: 'gato' },
        { time: new Date(20_000).toISOString(), label: 'carro' },
      ]
      expect(recordingCategory(recAt(0), events, 300_000)).toBe('carro')
      // ordem de inserção invertida não muda o resultado — é alfabético, não por ordem de chegada.
      const reversed = [
        { time: new Date(10_000).toISOString(), label: 'carro' },
        { time: new Date(20_000).toISOString(), label: 'gato' },
      ]
      expect(recordingCategory(recAt(0), reversed, 300_000)).toBe('carro')
    })
    it('estados sempre perde pra movimento (label vazio) no mesmo chunk', () => {
      const events = [
        { time: new Date(60_000).toISOString(), label: 'fechado', kind: 'state' as const },
        { time: new Date(90_000).toISOString(), label: '' },
      ]
      expect(recordingCategory(recAt(0), events, 300_000)).toBe('movimento')
    })
  })

  describe('CA3: padding lead/trail (config da câmera) alarga a janela de contenção nas duas pontas, sem virar uma janela fixa arbitrária', () => {
    it('evento antes do início do chunk, mas dentro do trailMs, é contado (padding pra trás)', () => {
      // chunk [0, 10_000); evento em -4_000 (4s antes do início) só conta com trailMs >= 4_000.
      const events = [{ time: new Date(-4_000).toISOString(), label: 'pessoa' }]
      expect(recordingCategory(recAt(0), events, 10_000)).toBe('continua')
      expect(recordingCategory(recAt(0), events, 10_000, { leadMs: 0, trailMs: 5_000 })).toBe(
        'pessoa',
      )
    })
    it('evento depois do fim do chunk, mas dentro do leadMs, é contado (padding pra frente)', () => {
      // chunk [0, 10_000); evento em 13_000 (3s depois do fim) só conta com leadMs >= 3_000.
      const events = [{ time: new Date(13_000).toISOString(), label: 'pessoa' }]
      expect(recordingCategory(recAt(0), events, 10_000)).toBe('continua')
      expect(recordingCategory(recAt(0), events, 10_000, { leadMs: 5_000, trailMs: 0 })).toBe(
        'pessoa',
      )
    })
    it('evento bem fora até do padding (lead/trail) continua não contando — não virou uma janela larga de novo', () => {
      const events = [{ time: new Date(60_000).toISOString(), label: 'pessoa' }]
      expect(recordingCategory(recAt(0), events, 10_000, { leadMs: 5_000, trailMs: 5_000 })).toBe(
        'continua',
      )
    })
  })
})

describe('eventCategory', () => {
  it('sem label → movimento', () => {
    expect(eventCategory({})).toBe('movimento')
    expect(eventCategory({ label: '' })).toBe('movimento')
    expect(eventCategory({ label: '   ' })).toBe('movimento')
  })
  it('label pessoa/person → pessoa', () => {
    expect(eventCategory({ label: 'pessoa' })).toBe('pessoa')
    expect(eventCategory({ label: 'Pessoa com chapéu' })).toBe('pessoa')
    expect(eventCategory({ label: 'person' })).toBe('pessoa')
  })
  describe('CA2: outro label de modelo é fiel ao label real (não mais bucket genérico "ia")', () => {
    it('outro label de modelo é fiel ao label real (não mais bucket genérico "ia")', () => {
      expect(eventCategory({ label: 'carro' })).toBe('carro')
      expect(eventCategory({ label: 'cachorro' })).toBe('cachorro')
    })
    it('label normalizado por trim + lowercase (mesmo bucket independente de caixa/espaços)', () => {
      expect(eventCategory({ label: '  Dog  ' })).toBe('dog')
      expect(eventCategory({ label: 'Cachorro' })).toBe('cachorro')
    })
  })
  it('kind=state → estados (independe do label)', () => {
    expect(eventCategory({ kind: 'state', label: 'aberto' })).toBe('estados')
    expect(eventCategory({ kind: 'state', label: 'pessoa' })).toBe('estados')
    expect(eventCategory({ kind: 'state', label: '' })).toBe('estados')
  })
})

describe('categoryColor', () => {
  describe('CA3: cores por categoria são fixas (conhecidas) e determinísticas (arbitrárias)', () => {
    it('movimento/pessoa/estados/continua têm cor fixa conhecida', () => {
      expect(categoryColor('movimento')).toBe('bg-amber-400')
      expect(categoryColor('pessoa')).toBe('bg-red-500')
      expect(categoryColor('estados')).toBe('bg-green-500')
      expect(categoryColor('continua')).toBe('bg-blue-500')
    })
    it('um label arbitrário sempre devolve a MESMA cor (determinístico)', () => {
      const c1 = categoryColor('carro')
      const c2 = categoryColor('carro')
      expect(c1).toBe(c2)
      expect(c1).toMatch(/^bg-/)
    })
    it('chamadas repetidas com labels diferentes continuam determinísticas cada uma', () => {
      const carro1 = categoryColor('carro')
      const cachorro1 = categoryColor('cachorro')
      const carro2 = categoryColor('carro')
      const cachorro2 = categoryColor('cachorro')
      expect(carro1).toBe(carro2)
      expect(cachorro1).toBe(cachorro2)
    })
  })
})

describe('categoryLabel', () => {
  it('capitaliza a 1ª letra pra exibição — mesma função pra categorias conhecidas e arbitrárias', () => {
    expect(categoryLabel('movimento')).toBe('Movimento')
    expect(categoryLabel('pessoa')).toBe('Pessoa')
    expect(categoryLabel('estados')).toBe('Estados')
    expect(categoryLabel('carro')).toBe('Carro')
  })
  it('string vazia devolve vazia (sem quebrar)', () => {
    expect(categoryLabel('')).toBe('')
  })
})

describe('categoryBorderColor', () => {
  it('mesmo tom de categoryColor pra categorias conhecidas, só troca bg- por border-', () => {
    expect(categoryBorderColor('movimento')).toBe('border-amber-400')
    expect(categoryBorderColor('pessoa')).toBe('border-red-500')
    expect(categoryBorderColor('estados')).toBe('border-green-500')
    expect(categoryBorderColor('continua')).toBe('border-blue-500')
  })
  it('label arbitrário: determinístico, e o MESMO tom de categoryColor pra essa categoria', () => {
    const bgTone = categoryColor('carro').replace('bg-', '')
    expect(categoryBorderColor('carro')).toBe(`border-${bgTone}`)
    // chamadas repetidas continuam estáveis.
    expect(categoryBorderColor('carro')).toBe(categoryBorderColor('carro'))
  })
})

describe('categoryStrokeColor', () => {
  it('mesmo tom de categoryColor pra categorias conhecidas, só troca bg- por stroke-', () => {
    expect(categoryStrokeColor('movimento')).toBe('stroke-amber-400')
    expect(categoryStrokeColor('pessoa')).toBe('stroke-red-500')
    expect(categoryStrokeColor('estados')).toBe('stroke-green-500')
    expect(categoryStrokeColor('continua')).toBe('stroke-blue-500')
  })
  it('label arbitrário: determinístico, e o MESMO tom de categoryColor/categoryBorderColor pra essa categoria', () => {
    const bgTone = categoryColor('carro').replace('bg-', '')
    expect(categoryStrokeColor('carro')).toBe(`stroke-${bgTone}`)
    expect(categoryStrokeColor('carro')).toBe(categoryStrokeColor('carro'))
  })
  it('cada classe usada aqui é um literal fixo na paleta — nunca construída em runtime por concatenação (Tailwind só descobre classes que aparecem literalmente no código-fonte)', () => {
    // Regressão: uma versão anterior de categoryBorderColor fazia
    // `categoryColor(cat).replace('bg-','border-')` — parecia funcionar nos tons
    // "conhecidos" só por coincidência (essas classes já existiam em outro lugar do
    // app), mas os tons da paleta de labels arbitrários nunca tinham `border-*`/
    // `stroke-*` de verdade gerados pelo Tailwind (confirmado inspecionando o CSS
    // compilado). Este teste não pega a ausência de CSS em si (fora do alcance do
    // vitest/jsdom), mas documenta e trava o contrato: os 3 tons de uma mesma
    // categoria SEMPRE compartilham a cor (nunca um tom pra bg e outro pra
    // border/stroke), o que só é garantido pela estrutura de paleta com literais.
    for (const cat of ['movimento', 'pessoa', 'estados', 'continua', 'carro', 'cachorro']) {
      const tone = (cls: string) => cls.replace(/^(bg|border|stroke)-/, '')
      expect(tone(categoryBorderColor(cat))).toBe(tone(categoryColor(cat)))
      expect(tone(categoryStrokeColor(cat))).toBe(tone(categoryColor(cat)))
    }
  })
})

describe('eventTitle', () => {
  it('título por categoria', () => {
    expect(eventTitle({})).toBe('Movimento detectado')
    expect(eventTitle({ label: 'pessoa' })).toBe('Pessoa detectada')
    expect(eventTitle({ label: 'carro' })).toBe('Carro')
  })
})

describe('firstEventInChunk', () => {
  const recAt = (ms: number) => ({ start: new Date(ms).toISOString() })
  const ev = (id: number, ms: number, extra: Record<string, unknown> = {}) => ({
    id,
    time: new Date(ms).toISOString(),
    ...extra,
  })

  it('devolve o evento mais antigo (por time) dentro de [start, start+chunk)', () => {
    const events = [ev(2, 120_000), ev(1, 60_000), ev(3, 200_000)]
    expect(firstEventInChunk(recAt(0), events, 300_000)?.id).toBe(1)
  })
  it('ignora eventos fora da janela do chunk', () => {
    const events = [ev(9, 400_000)]
    expect(firstEventInChunk(recAt(0), events, 300_000)).toBeNull()
  })
  it('inclui transições de estado (kind=state)', () => {
    const events = [ev(5, 90_000, { kind: 'state', label: 'aberto' })]
    expect(firstEventInChunk(recAt(0), events, 300_000)?.id).toBe(5)
  })
  it('sem eventos → null', () => {
    expect(firstEventInChunk(recAt(0), [], 300_000)).toBeNull()
  })
})

describe('eventCardLines', () => {
  it('estado: classificador no título, estado no subtítulo (Janela / apagada)', () => {
    expect(
      eventCardLines({ kind: 'state', label: 'apagada', classifier_name: 'Janela' }, 'Cam1'),
    ).toEqual({ title: 'Janela', subtitle: 'apagada' })
  })
  it('estado sem classifier_name cai pra câmera no título', () => {
    expect(eventCardLines({ kind: 'state', label: 'apagada' }, 'Cam1')).toEqual({
      title: 'Cam1',
      subtitle: 'apagada',
    })
  })
  it('movimento: descrição no título, câmera no subtítulo', () => {
    expect(eventCardLines({ label: '' }, 'Cam1')).toEqual({
      title: 'Movimento detectado',
      subtitle: 'Cam1',
    })
  })
  it('label específico: título capitalizado, câmera no subtítulo', () => {
    expect(eventCardLines({ label: 'carro' }, 'Cam1')).toEqual({ title: 'Carro', subtitle: 'Cam1' })
  })
})

describe('filterEventsByCategory', () => {
  const evs = [
    { id: 1, label: '' },
    { id: 2, label: 'pessoa' },
    { id: 3, label: 'carro' },
    { id: 4, label: 'Pessoa detectada' },
    { id: 5, label: 'aberto', kind: 'state' as const },
  ]
  it('todos devolve tudo', () => {
    expect(filterEventsByCategory(evs, 'todos')).toHaveLength(5)
  })
  it('filtra por movimento', () => {
    expect(filterEventsByCategory(evs, 'movimento').map((e) => e.id)).toEqual([1])
  })
  it('filtra por pessoa', () => {
    expect(filterEventsByCategory(evs, 'pessoa').map((e) => e.id)).toEqual([2, 4])
  })
  it('filtra por um label específico (ex.: carro) — fiel ao label real, não mais um bucket "ia"', () => {
    expect(filterEventsByCategory(evs, 'carro').map((e) => e.id)).toEqual([3])
  })
  it('filtra por estados (transições kind=state)', () => {
    expect(filterEventsByCategory(evs, 'estados').map((e) => e.id)).toEqual([5])
  })
})

describe('matchesTimelineFilter', () => {
  it('"todos" casa com qualquer categoria', () => {
    expect(matchesTimelineFilter('continua', 'todos')).toBe(true)
    expect(matchesTimelineFilter('movimento', 'todos')).toBe(true)
    expect(matchesTimelineFilter('pessoa', 'todos')).toBe(true)
    expect(matchesTimelineFilter('estados', 'todos')).toBe(true)
    expect(matchesTimelineFilter('carro', 'todos')).toBe(true)
  })
  describe('CA6: fora de "todos", o dropdown casa por igualdade estrita entre categoria e filtro (labels reais, não dicotomias amplas)', () => {
    it('fora de "todos", a igualdade é ESTRITA — o dropdown lista labels reais, não dicotomias amplas', () => {
      // Modelo antigo (chips fixos): "movimento" casava com QUALQUER categoria de evento
      // (dicotomia grossa "tem evento" vs "não tem"). No modelo de dropdown dinâmico isso
      // deixa de fazer sentido — "movimento" é só mais uma opção entre outras, "Tudo" já
      // cobre o caso "qualquer evento".
      expect(matchesTimelineFilter('movimento', 'movimento')).toBe(true)
      expect(matchesTimelineFilter('pessoa', 'movimento')).toBe(false)
      expect(matchesTimelineFilter('carro', 'movimento')).toBe(false)
      expect(matchesTimelineFilter('estados', 'movimento')).toBe(false)
      expect(matchesTimelineFilter('continua', 'movimento')).toBe(false)
    })
    it('"pessoa" casa só com a categoria pessoa', () => {
      expect(matchesTimelineFilter('pessoa', 'pessoa')).toBe(true)
      expect(matchesTimelineFilter('movimento', 'pessoa')).toBe(false)
      expect(matchesTimelineFilter('carro', 'pessoa')).toBe(false)
      expect(matchesTimelineFilter('estados', 'pessoa')).toBe(false)
      expect(matchesTimelineFilter('continua', 'pessoa')).toBe(false)
    })
    it('"continua" casa só com a categoria continua', () => {
      expect(matchesTimelineFilter('continua', 'continua')).toBe(true)
      expect(matchesTimelineFilter('movimento', 'continua')).toBe(false)
      expect(matchesTimelineFilter('pessoa', 'continua')).toBe(false)
    })
    it('um label específico dinâmico (ex.: "carro") casa só com ele mesmo', () => {
      expect(matchesTimelineFilter('carro', 'carro')).toBe(true)
      expect(matchesTimelineFilter('cachorro', 'carro')).toBe(false)
      expect(matchesTimelineFilter('pessoa', 'carro')).toBe(false)
      expect(matchesTimelineFilter('continua', 'carro')).toBe(false)
    })
  })
})
