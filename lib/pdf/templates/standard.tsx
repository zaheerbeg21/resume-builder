import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Resume } from '@/types/resume';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatYearMonth(ym: string | null | undefined): string {
  if (!ym) return '';
  const parts = ym.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    if (month < 1 || month > 12) {
      return ym;
    }
    const monthName = MONTH_NAMES[month - 1];
    return `${monthName} ${year}`;
  }
  return ym;
}

function formatResumeDate(
  start: string | null | undefined,
  end: string | null | undefined,
  current: boolean
): string {
  const startStr = formatYearMonth(start);
  const endStr = current ? 'Present' : formatYearMonth(end);
  if (startStr && endStr) return `${startStr} - ${endStr}`;
  return startStr || endStr;
}

const styles = StyleSheet.create({
  page: {
    padding: 46.8, // strictly 0.65 in on all sides
    fontFamily: 'Inter',
    fontSize: 10.5,
    lineHeight: 1.35,
    color: '#111827',
  },
  header: {
    marginBottom: 8,
  },
  fullName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  headline: {
    fontSize: 10.5,
    color: '#374151',
    marginBottom: 3,
  },
  contact: {
    fontSize: 9.5,
    color: '#4B5563',
    marginBottom: 2,
  },
  section: {
    marginTop: 6,
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#D1D5DB',
    paddingBottom: 1,
  },
  body: {
    fontSize: 10.5,
    lineHeight: 1.35,
  },
  entry: {
    marginBottom: 4,
  },
  title: {
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  company: {
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  school: {
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  date: {
    fontSize: 9.5,
    color: '#4B5563',
    marginBottom: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 1.5,
  },
  bulletDot: {
    width: 10,
    fontSize: 10.5,
    lineHeight: 1.35,
  },
  bulletText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 1.35,
  },
  skillRow: {
    fontSize: 10.5,
    lineHeight: 1.35,
    marginBottom: 1.5,
  },
  skillGroup: {
    fontWeight: 'bold',
  },
});

export function ResumeDocument({ resume }: { resume: Resume }): React.ReactElement {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header / Basics */}
        <View style={styles.header}>
          <Text style={styles.fullName}>{resume.basics.fullName}</Text>
          {resume.basics.headline ? (
            <Text style={styles.headline}>{resume.basics.headline}</Text>
          ) : null}
          <Text style={styles.contact}>
            {[resume.basics.email, resume.basics.phone, resume.basics.location]
              .filter(Boolean)
              .join(' • ')}
          </Text>
        </View>

        {/* Summary */}
        {resume.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Summary</Text>
            <Text style={styles.body}>{resume.summary}</Text>
          </View>
        ) : null}

        {/* Experience */}
        {resume.experience && resume.experience.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Experience</Text>
            {resume.experience.map((exp) => (
              <View key={exp.id} style={styles.entry}>
                <Text style={styles.title}>{exp.title}</Text>
                <Text style={styles.company}>{exp.company}</Text>
                <Text style={styles.date}>
                  {formatResumeDate(exp.start, exp.end, exp.current)}
                </Text>
                {exp.bullets.map((bullet, idx) => (
                  <View key={idx} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* Education */}
        {resume.education && resume.education.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Education</Text>
            {resume.education.map((edu) => (
              <View key={edu.id} style={styles.entry}>
                <Text style={styles.school}>{edu.school}</Text>
                {edu.degree ? <Text style={styles.body}>{edu.degree}</Text> : null}
                <Text style={styles.date}>
                  {formatResumeDate(edu.start, edu.end, false)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Skills */}
        {resume.skills && resume.skills.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Skills</Text>
            {resume.skills.map((s) => (
              <Text key={s.group} style={styles.skillRow}>
                <Text style={styles.skillGroup}>{s.group}: </Text>
                {s.items.join(', ')}
              </Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
