import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { RISK_LEVELS } from '../../utils/risk'
import { formatNumber } from '../../utils/format'

export default function RiskDistribution({ distribution }) {
  const navigate = useNavigate()
  const data = Object.entries(RISK_LEVELS).map(([key, meta]) => ({
    key, label: meta.label, count: distribution?.[key] ?? 0, fill: meta.chart,
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={72}
               tick={{ fontSize: 12, fill: '#475467' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [formatNumber(v), 'Projects']}
                 cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22}
             onClick={(d) => navigate(`/projects?risk_level=${d.key}`)}
             className="cursor-pointer" isAnimationActive={false}
             label={{ position: 'right', fontSize: 12, fill: '#475467',
                      formatter: (v) => formatNumber(v) }}>
          {data.map((d) => <Cell key={d.key} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
